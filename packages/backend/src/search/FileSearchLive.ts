import { FileFinder, type Result } from "@ff-labs/fff-node";
import { Effect, Layer } from "effect";
import * as NodeFs from "node:fs/promises";
import { SearchConfig, SearchConfigLive } from "../config.js";
import { ExtractCache, ExtractCacheLive } from "../document/ExtractCache.js";
import { FileSearchError, type GrepMode } from "@the-search-thing/api";
import { FileSearchService } from "./FileSearchService.js";

const defaultLimit = 20;

const fromResult = <A, B>(
  result: Result<A>,
  onSuccess: (value: A) => B,
): Effect.Effect<B, FileSearchError> =>
  result.ok
    ? Effect.succeed(onSuccess(result.value))
    : Effect.fail(FileSearchError.make({ message: result.error }));

const createFinder = (basePath: string) =>
  Effect.gen(function* () {
    const created = FileFinder.create({ basePath, aiMode: true });
    if (!created.ok) {
      return yield* Effect.die(new Error(created.error));
    }

    const finder = yield* Effect.acquireRelease(
      Effect.sync(() => created.value),
      (instance) => Effect.sync(() => instance.destroy()),
    );

    const scanResult = yield* Effect.tryPromise({
      try: () => finder.waitForScan(10_000),
      catch: (error) =>
        FileSearchError.make({
          message: error instanceof Error ? error.message : String(error),
        }),
    });

    if (!scanResult.ok) {
      return yield* FileSearchError.make({ message: scanResult.error });
    }
    if (!scanResult.value) {
      return yield* FileSearchError.make({
        message: `Initial file scan timed out for ${basePath}`,
      });
    }

    return finder;
  });

const grepFinder = (finder: FileFinder, input: { query: string; mode: GrepMode; limit: number }) =>
  Effect.sync(() =>
    finder.grep(input.query, {
      mode: input.mode,
      pageSize: input.limit,
    }),
  ).pipe(
    Effect.flatMap((result) =>
      fromResult(result, (value) => ({
        items: value.items.map((item) => ({
          relativePath: item.relativePath,
          lineNumber: item.lineNumber,
          lineContent: item.lineContent,
        })),
        totalMatched: value.totalMatched,
      })),
    ),
  );

export const FileSearchLive = Layer.effect(FileSearchService)(
  Effect.gen(function* () {
    const { root, extractCacheDir } = yield* SearchConfig;
    const extractCache = yield* ExtractCache;

    yield* extractCache
      .ensureReady()
      .pipe(Effect.mapError((error) => FileSearchError.make({ message: error.message })));

    yield* Effect.tryPromise({
      try: () => NodeFs.mkdir(extractCacheDir, { recursive: true }),
      catch: (error) =>
        FileSearchError.make({
          message: error instanceof Error ? error.message : String(error),
        }),
    });

    const rootFinder = yield* createFinder(root);
    const extractFinder = yield* createFinder(extractCacheDir);

    const refreshExtractIndex = () =>
      Effect.gen(function* () {
        const scan = extractFinder.scanFiles();
        if (!scan.ok) {
          return yield* FileSearchError.make({ message: scan.error });
        }
        const ready = yield* Effect.tryPromise({
          try: () => extractFinder.waitForScan(10_000),
          catch: (error) =>
            FileSearchError.make({
              message: error instanceof Error ? error.message : String(error),
            }),
        });
        if (!ready.ok) {
          return yield* FileSearchError.make({ message: ready.error });
        }
        if (!ready.value) {
          return yield* FileSearchError.make({ message: "Extract cache rescan timed out" });
        }
      });

    return {
      fileSearch: ({ query, limit = defaultLimit }) =>
        Effect.sync(() => rootFinder.fileSearch(query, { pageSize: limit })).pipe(
          Effect.flatMap((result) =>
            fromResult(result, (value) => ({
              items: value.items.map((item) => ({
                relativePath: item.relativePath,
                fileName: item.fileName,
              })),
              totalMatched: value.totalMatched,
            })),
          ),
        ),

      contentSearch: ({ query, mode = "plain", limit = defaultLimit }) =>
        Effect.gen(function* () {
          const native = yield* grepFinder(rootFinder, { query, mode, limit });
          const extracted = yield* grepFinder(extractFinder, { query, mode, limit });

          const remapped = extracted.items.flatMap((item) => {
            const original = extractCache.originalRelativePath(item.relativePath);
            if (!original) return [];
            return [
              {
                relativePath: original,
                lineNumber: item.lineNumber,
                lineContent: item.lineContent,
              },
            ];
          });

          const items = [...native.items, ...remapped].slice(0, limit);
          return {
            items,
            totalMatched: native.totalMatched + extracted.totalMatched,
          };
        }),

      refreshExtractIndex,
    };
  }),
).pipe(Layer.provide(ExtractCacheLive), Layer.provide(SearchConfigLive));
