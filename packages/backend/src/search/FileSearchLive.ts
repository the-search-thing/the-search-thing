import { FileFinder, type Result } from "@ff-labs/fff-node"
import { Effect, Layer } from "effect"
import { SearchConfig, SearchConfigLive } from "../config.js"
import { FileSearchError, FileSearchService } from "./FileSearchService.js"

const defaultLimit = 20

const fromResult = <A, B>(
  result: Result<A>,
  onSuccess: (value: A) => B,
): Effect.Effect<B, FileSearchError> =>
  result.ok
    ? Effect.succeed(onSuccess(result.value))
    : Effect.fail(FileSearchError.make({ message: result.error }))

export const FileSearchLive = Layer.effect(FileSearchService)(
  Effect.gen(function* () {
    const { root } = yield* SearchConfig

    const created = FileFinder.create({ basePath: root, aiMode: true })
    if (!created.ok) {
      return yield* Effect.die(new Error(created.error))
    }

    const finder = yield* Effect.acquireRelease(
      Effect.sync(() => created.value),
      (instance) => Effect.sync(() => instance.destroy()),
    )

    const scanResult = yield* Effect.tryPromise({
      try: () => finder.waitForScan(10_000),
      catch: (error) =>
        FileSearchError.make({
          message: error instanceof Error ? error.message : String(error),
        }),
    })

    if (!scanResult.ok) {
      return yield* FileSearchError.make({ message: scanResult.error })
    }

    if (!scanResult.value) {
      return yield* FileSearchError.make({ message: "Initial file scan timed out" })
    }

    return {
      fileSearch: ({ query, limit = defaultLimit }) =>
        Effect.sync(() => finder.fileSearch(query, { pageSize: limit })).pipe(
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
        Effect.sync(() =>
          finder.grep(query, {
            mode,
            pageSize: limit,
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
        ),
    }
  }),
).pipe(Layer.provide(SearchConfigLive))
