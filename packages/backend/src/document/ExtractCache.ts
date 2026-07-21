import { createHash } from "node:crypto";
import * as NodeFs from "node:fs/promises";
import * as NodePath from "node:path";
import { Context, Effect, Layer, Result, Schema } from "effect";
import { SearchConfig, SearchConfigLive } from "../config.js";

export class ExtractCacheError extends Schema.TaggedErrorClass<ExtractCacheError>()(
  "ExtractCacheError",
  {
    message: Schema.String,
  },
) {}

/** Normalize a SEARCH_ROOT-relative path for cache keys / keep-sets. */
export const normalizeRelativeSourcePath = (relativeSourcePath: string): string =>
  relativeSourcePath.replaceAll("\\", "/").replace(/^\/+/, "");

/** Safe relative mirror path for a SEARCH_ROOT path → cache .txt */
export const cacheRelativePathFor = (relativeSourcePath: string): string => {
  return `${normalizeRelativeSourcePath(relativeSourcePath)}.txt`;
};

type CacheWalkResult = {
  readonly files: ReadonlyArray<string>;
  /** Cache-relative directory prefixes that could not be listed (maps to source prefixes). */
  readonly inaccessiblePrefixes: ReadonlyArray<string>;
};

/**
 * Recursively list `.txt` extracts under `dir`.
 *
 * Nested `readdir` failures are soft: recorded as `inaccessiblePrefixes` and the
 * walk continues. Failure to read `root` itself is a typed `ExtractCacheError`.
 */
const walkCacheTxtFiles: (
  dir: string,
  root: string,
) => Effect.Effect<CacheWalkResult, ExtractCacheError> = Effect.fn("walkCacheTxtFiles")(function* (
  dir: string,
  root: string,
) {
  const listed = yield* Effect.result(
    Effect.tryPromise({
      try: () => NodeFs.readdir(dir, { withFileTypes: true }),
      catch: (error) =>
        ExtractCacheError.make({
          message: error instanceof Error ? error.message : String(error),
        }),
    }),
  );

  if (Result.isFailure(listed)) {
    if (NodePath.resolve(dir) === NodePath.resolve(root)) {
      return yield* Effect.fail(listed.failure);
    }
    return {
      files: [],
      inaccessiblePrefixes: [normalizeRelativeSourcePath(NodePath.relative(root, dir))],
    } satisfies CacheWalkResult;
  }

  const files: string[] = [];
  const inaccessiblePrefixes: string[] = [];

  for (const entry of listed.success) {
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".meta") continue;
      const nested = yield* walkCacheTxtFiles(full, root);
      files.push(...nested.files);
      inaccessiblePrefixes.push(...nested.inaccessiblePrefixes);
    } else if (entry.isFile() && entry.name.endsWith(".txt")) {
      files.push(NodePath.relative(root, full).replaceAll("\\", "/"));
    }
  }

  return { files, inaccessiblePrefixes } satisfies CacheWalkResult;
});


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

    /**
     * Delete cache entries whose source paths are not in `keepRelativeSourcePaths`
     * (normalized with `/`). Removes both `.txt` extracts and matching `.meta` hashes.
     * Paths under `preservePathPrefixes` are kept even if absent from the keep-set
     * (e.g. directories the indexer could not read). Nested cache directories that
     * are unreadable during the prune walk are also treated as preserve prefixes
     * so pruning continues for accessible entries instead of aborting entirely.
     */
    readonly pruneMissing: (
      keepRelativeSourcePaths: ReadonlySet<string>,
      preservePathPrefixes?: ReadonlyArray<string>,
    ) => Effect.Effect<{ pruned: number }, ExtractCacheError>;

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

    const originalRelativePath = (cacheRelativePath: string): string | undefined => {
      const normalized = cacheRelativePath.replaceAll("\\", "/");
      if (!normalized.endsWith(".txt")) return undefined;
      return normalized.slice(0, -".txt".length);
    };

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

      pruneMissing: (keepRelativeSourcePaths, preservePathPrefixes = []) =>
        Effect.gen(function* () {
          yield* ensureReady();

          const walk = yield* walkCacheTxtFiles(extractCacheDir, extractCacheDir);

          const prefixes = [
            ...preservePathPrefixes.map(normalizeRelativeSourcePath),
            ...walk.inaccessiblePrefixes.map(normalizeRelativeSourcePath),
          ];
          const isPreserved = (relativeSourcePath: string): boolean =>
            prefixes.some(
              (prefix) =>
                relativeSourcePath === prefix || relativeSourcePath.startsWith(`${prefix}/`),
            );

          let pruned = 0;
          for (const cacheRelativePath of walk.files) {
            const original = originalRelativePath(cacheRelativePath);
            if (!original || keepRelativeSourcePaths.has(original) || isPreserved(original)) {
              continue;
            }

            const absoluteCachePath = NodePath.join(extractCacheDir, cacheRelativePath);
            const metaPath = hashMetaPath(cacheRelativePath);

            yield* Effect.tryPromise({
              try: async () => {
                await NodeFs.unlink(absoluteCachePath).catch((error: NodeJS.ErrnoException) => {
                  if (error.code !== "ENOENT") throw error;
                });
                await NodeFs.unlink(metaPath).catch((error: NodeJS.ErrnoException) => {
                  if (error.code !== "ENOENT") throw error;
                });
              },
              catch: (error) =>
                ExtractCacheError.make({
                  message: error instanceof Error ? error.message : String(error),
                }),
            });

            pruned += 1;
          }

          return { pruned };
        }),

      originalRelativePath,
    };
  }),
).pipe(Layer.provide(SearchConfigLive));
