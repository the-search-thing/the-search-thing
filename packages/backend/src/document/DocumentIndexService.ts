import { Context, Effect, Layer, Result } from "effect";
import type { Dirent } from "node:fs";
import * as NodeFs from "node:fs/promises";
import * as NodePath from "node:path";
import { SearchConfig, SearchConfigLive } from "../config.js";
import { DocumentExtractLive } from "./DocumentExtractLive.js";
import { DocumentExtractService } from "./DocumentExtractService.js";
import { DocumentIndexError } from "@the-search-thing/api";
import { ExtractCache, ExtractCacheLive, normalizeRelativeSourcePath } from "./ExtractCache.js";

export class DocumentIndexService extends Context.Service<
  DocumentIndexService,
  {
    readonly run: () => Effect.Effect<
      {
        scanned: number;
        extracted: number;
        skipped: number;
        failed: number;
        pruned: number;
        errors: ReadonlyArray<{ path: string; message: string }>;
      },
      DocumentIndexError
    >;
  }
>()("DocumentIndexService") {}

type WalkIssue = { path: string; message: string };

/** Recursively list files under `dir`. Unreadable subdirectories are recorded in
 * `issues` and skipped; failure to read `root` itself still throws. */
const walkFiles = async (
  dir: string,
  root: string,
  issues: WalkIssue[],
): Promise<ReadonlyArray<string>> => {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await NodeFs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (NodePath.resolve(dir) === NodePath.resolve(root)) {
      throw error;
    }
    issues.push({
      path: normalizeRelativeSourcePath(NodePath.relative(root, dir)),
      message: error instanceof Error ? error.message : String(error),
    });
    return out;
  }

  for (const entry of entries) {
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".data") {
        continue;
      }
      out.push(...(await walkFiles(full, root, issues)));
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

          const walkIssues: WalkIssue[] = [];
          const files = yield* Effect.tryPromise({
            try: () => walkFiles(root, root, walkIssues),
            catch: (error) =>
              DocumentIndexError.make({
                message: error instanceof Error ? error.message : String(error),
              }),
          });

          let extracted = 0;
          let skipped = 0;
          let failed = walkIssues.length;
          const errors: Array<{ path: string; message: string }> = [...walkIssues];
          const presentSources = new Set<string>();
          const inaccessiblePrefixes = walkIssues.map((issue) => issue.path);

          for (const absolutePath of files) {
            if (!extract.supports(absolutePath)) {
              continue;
            }

            const relativeSourcePath = normalizeRelativeSourcePath(
              NodePath.relative(root, absolutePath),
            );
            presentSources.add(relativeSourcePath);

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

          const { pruned } = yield* cache
            .pruneMissing(presentSources, inaccessiblePrefixes)
            .pipe(Effect.mapError((error) => DocumentIndexError.make({ message: error.message })));

          return {
            scanned: files.length,
            extracted,
            skipped,
            failed,
            pruned,
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
