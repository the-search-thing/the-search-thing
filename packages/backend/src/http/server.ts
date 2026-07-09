import { HttpApiBuilder, HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { createServer } from "node:http"
import { Api } from "./api.js"

const HealthLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("healthz", () =>
    Effect.succeed({
      ok: true,
      service: "backend",
    }),
  ),
)

const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(HealthLive),
)

export const ServerLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiLive),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3333 })),
)
