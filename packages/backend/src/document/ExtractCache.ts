import { createHash } from "node:crypto";
import * as NodeFs from "node:fs/promises";
import * as NodePath from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { SearchConfig, SearchConfigLive } from "../config.js";

export class ExtractCacheError extends Schema.TaggedErrorClass<ExtractCacheError>()(
  "ExtractCacheError",
  {
    message: Schema.String,
  },
) {}

/** Safe relative mirror path for a SEARCH_ROOT path → cache .txt */
export const cacheRelativePathFor = (relativeSourcePath: string): string => {
  const normalized = relativeSourcePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return `${normalized}.txt`;
};

export class ExtractCache extends Context.Service<
  ExtractCache,
  {
    readonly cacheDir: string;

    readonly ensureReady: () => Effect.Effect<void, ExtractCacheError>;

    readonly contentHash: (absolutePath: string) => Effect.Effect<string, ExtractCacheError>;

    /**
     * Write extracted text if hash changed. Returns the cache-relative `.txt` path
     * (under cacheDir) and whether a write happened.
     */
    readonly upsert: (input: {
      relativeSourcePath: string;
      absoluteSourcePath: string;
      text: string;
    }) => Effect.Effect<{ cacheRelativePath: string; written: boolean }, ExtractCacheError>;

    /** Map a cache-relative `.txt` path back to the original relative source path. */
    readonly originalRelativePath: (cacheRelativePath: string) => string | undefined;
  }
>()("ExtractCache") {}

export const ExtractCacheLive = Layer.effect(ExtractCache)(
  Effect.gen(function* () {
    const { extractCacheDir } = yield* SearchConfig;
    const metaDir = NodePath.join(extractCacheDir, ".meta");

    const ensureReady = () =>
      Effect.tryPromise({
        try: async () => {
          await NodeFs.mkdir(extractCacheDir, { recursive: true });
          await NodeFs.mkdir(metaDir, { recursive: true });
        },
        catch: (error) =>
          ExtractCacheError.make({
            message: error instanceof Error ? error.message : String(error),
          }),
      });

    const contentHash = (absolutePath: string) =>
      Effect.tryPromise({
        try: async () => {
          const buf = await NodeFs.readFile(absolutePath);
          return createHash("sha256").update(buf).digest("hex");
        },
        catch: (error) =>
          ExtractCacheError.make({
            message: error instanceof Error ? error.message : String(error),
          }),
      });

    const hashMetaPath = (cacheRelativePath: string) =>
      NodePath.join(metaDir, `${cacheRelativePath.replaceAll("/", "__")}.sha256`);

    return {
      cacheDir: extractCacheDir,

      ensureReady,

      contentHash,

      upsert: ({ relativeSourcePath, absoluteSourcePath, text }) =>
        Effect.gen(function* () {
          yield* ensureReady();
          const cacheRelativePath = cacheRelativePathFor(relativeSourcePath);
          const absoluteCachePath = NodePath.join(extractCacheDir, cacheRelativePath);
          const hash = yield* contentHash(absoluteSourcePath);
          const metaPath = hashMetaPath(cacheRelativePath);

          const previous = yield* Effect.tryPromise({
            try: () => NodeFs.readFile(metaPath, "utf8"),
            catch: (error) =>
              ExtractCacheError.make({
                message: error instanceof Error ? error.message : String(error),
              }),
          }).pipe(Effect.orElseSucceed(() => null as string | null));

          if (previous === hash) {
            const exists = yield* Effect.tryPromise({
              try: async () => {
                await NodeFs.access(absoluteCachePath);
                return true;
              },
              catch: () => false,
            }).pipe(Effect.orElseSucceed(() => false));

            if (exists) {
              return { cacheRelativePath, written: false };
            }
          }

          yield* Effect.tryPromise({
            try: async () => {
              await NodeFs.mkdir(NodePath.dirname(absoluteCachePath), { recursive: true });
              await NodeFs.writeFile(absoluteCachePath, text, "utf8");
              await NodeFs.mkdir(NodePath.dirname(metaPath), { recursive: true });
              await NodeFs.writeFile(metaPath, hash, "utf8");
            },
            catch: (error) =>
              ExtractCacheError.make({
                message: error instanceof Error ? error.message : String(error),
              }),
          });

          return { cacheRelativePath, written: true };
        }),

      originalRelativePath: (cacheRelativePath) => {
        const normalized = cacheRelativePath.replaceAll("\\", "/");
        if (!normalized.endsWith(".txt")) return undefined;
        return normalized.slice(0, -".txt".length);
      },
    };
  }),
).pipe(Layer.provide(SearchConfigLive));
