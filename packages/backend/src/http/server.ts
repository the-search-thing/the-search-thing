import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { createServer } from "node:http"
import { Api, ContentSearchResponse, FileSearchResponse, HealthResponse} from "./api.js"

const HealthLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("healthz", () =>
    Effect.succeed(new HealthResponse({
      ok: true,
      service: "backend",
    })),
  ),
)
const SearchLive = HttpApiBuilder.group(Api, "search", (handlers) =>
  handlers.handle("fileSearch", ({ query }) =>
    Effect.succeed(new FileSearchResponse({
      query: query.q,
      items: [],
      totalMatched: 0,
    })),
  ).handle("contentSearch", ({ query }) =>
    Effect.succeed(new ContentSearchResponse({
      query: query.q,
      items: [],
      totalMatched: 0,
      mode: "plain",
    })),
  ),
)

const HttpLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(HealthLive),
  Layer.provide(SearchLive),
  HttpRouter.serve,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
)

Layer.launch(HttpLive).pipe(NodeRuntime.runMain)
