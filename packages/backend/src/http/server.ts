import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { createServer } from "node:http"
import { Api, ContentSearchItem, ContentSearchResponse, FileSearchItem, FileSearchResponse, HealthResponse } from "./api.js"
import { FileSearchLive } from "../search/FileSearchLive.js"
import { FileSearchService } from "../search/FileSearchService.js"

const HealthLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("healthz", () =>
    Effect.succeed(new HealthResponse({
      ok: true,
      service: "backend",
    })),
  ),
)

const SearchLive = HttpApiBuilder.group(
  Api,
  "search",
  Effect.fn(function* (handlers) {
    const search = yield* FileSearchService
    return handlers
      .handle("fileSearch", ({ query }) =>
        Effect.gen(function* () {
          const result = yield* search.fileSearch({ query: query.q, limit: query.limit })
          return new FileSearchResponse({
            query: query.q,
            items: result.items.map((item) => new FileSearchItem(item)),
            totalMatched: result.totalMatched,
          })
        }),
      )
      .handle("contentSearch", ({ query }) =>
        Effect.gen(function* () {
          const result = yield* search.contentSearch({
            query: query.q,
            limit: query.limit,
            mode: query.mode,
          })
          return new ContentSearchResponse({
            query: query.q,
            mode: query.mode ?? "plain",
            items: result.items.map((item) => new ContentSearchItem(item)),
            totalMatched: result.totalMatched,
          })
        }),
      )
  }),
).pipe(Layer.provide(FileSearchLive))

const HttpLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(HealthLive),
  Layer.provide(SearchLive),
  HttpRouter.serve,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
)

Layer.launch(HttpLive).pipe(NodeRuntime.runMain)
