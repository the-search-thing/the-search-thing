import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

export class HealthResponse extends Schema.Class<HealthResponse>("HealthResponse")({
  ok: Schema.Boolean,
  service: Schema.String,
}) { }

export class HealthApi extends HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("healthz", "/healthz").addSuccess(HealthResponse),
) { }

export class Api extends HttpApi.make("api").add(HealthApi) { }
