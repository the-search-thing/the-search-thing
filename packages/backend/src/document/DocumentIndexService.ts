import { Context, Effect, Layer, Result } from "effect";
import * as NodeFs from "node:fs/promises";
import * as NodePath from "node:path";
import { SearchConfig, SearchConfigLive } from "../config.js";
import { DocumentExtractLive } from "./DocumentExtractLive.js";
import { DocumentExtractService } from "./DocumentExtractService.js";
import { DocumentIndexError } from "@the-search-thing/api";
import { ExtractCache, ExtractCacheLive } from "./ExtractCache.js";

export class DocumentIndexService extends Context.Service<
  DocumentIndexService,
  {
    readonly run: () => Effect.Effect<
      {
        scanned: number;
        extracted: number;
        skipped: number;
        failed: number;
        errors: ReadonlyArray<{ path: string; message: string }>;
      },
      DocumentIndexError
    >;
  }
>()("DocumentIndexService") {}

const walkFiles = async (dir: string): Promise<ReadonlyArray<string>> => {
  const out: string[] = [];
  const entries = await NodeFs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".data") {
        continue;
      }
      out.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
};

export const DocumentIndexLive = Layer.effect(DocumentIndexService)(
  Effect.gen(function* () {
    const { root } = yield* SearchConfig;
    const extract = yield* DocumentExtractService;
    const cache = yield* ExtractCache;

    return {
      run: () =>
        Effect.gen(function* () {
          yield* cache
            .ensureReady()
            .pipe(Effect.mapError((error) => DocumentIndexError.make({ message: error.message })));

          const files = yield* Effect.tryPromise({
            try: () => walkFiles(root),
            catch: (error) =>
              DocumentIndexError.make({
                message: error instanceof Error ? error.message : String(error),
              }),
          });

          let extracted = 0;
          let skipped = 0;
          let failed = 0;
          const errors: Array<{ path: string; message: string }> = [];

          for (const absolutePath of files) {
            if (!extract.supports(absolutePath)) {
              continue;
            }

            const relativeSourcePath = NodePath.relative(root, absolutePath);

            const outcome = yield* Effect.result(
              extract.extract(absolutePath).pipe(
                Effect.flatMap((parsed) =>
                  cache.upsert({
                    relativeSourcePath,
                    absoluteSourcePath: absolutePath,
                    text: parsed.text,
                  }),
                ),
              ),
            );

            if (Result.isFailure(outcome)) {
              failed += 1;
              errors.push({ path: relativeSourcePath, message: outcome.failure.message });
              continue;
            }

            if (outcome.success.written) {
              extracted += 1;
            } else {
              skipped += 1;
            }
          }

          return {
            scanned: files.length,
            extracted,
            skipped,
            failed,
            errors,
          };
        }),
    };
  }),
).pipe(
  Layer.provide(DocumentExtractLive),
  Layer.provide(ExtractCacheLive),
  Layer.provide(SearchConfigLive),
);
