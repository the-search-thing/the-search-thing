import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { Schema } from "effect"

export class HealthResponse extends Schema.Class<HealthResponse>("HealthResponse")({
  ok: Schema.Boolean,
  service: Schema.String,
}) { }

export class FileSearchItem extends Schema.Class<FileSearchItem>("FileSearchItem")({
  relativePath: Schema.String,
  fileName: Schema.String,
}) { }

export class FileSearchResponse extends Schema.Class<FileSearchResponse>("FileSearchResponse")({
  query: Schema.String,
  items: Schema.Array(FileSearchItem),
  totalMatched: Schema.Number,
}) { }


export class ContentSearchItem extends Schema.Class<ContentSearchItem>("ContentSearchItem")({
  relativePath: Schema.String,
  lineNumber: Schema.Number,
  lineContent: Schema.String,
}) { }

export class ContentSearchResponse extends Schema.Class<ContentSearchResponse>("ContentSearchResponse")({
  query: Schema.String,
  items: Schema.Array(ContentSearchItem),
  totalMatched: Schema.Number,
  mode: Schema.String,
  // schema.literal("plain, fuzzy, regex")
}) { }

export class HealthApi extends HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("healthz", "/healthz", {
      success: HealthResponse,
    }),
) { }


export class Search extends HttpApiGroup.make("search")
  .add(
    HttpApiEndpoint.get("fileSearch", "/search/files", {
      query: {
        q: Schema.String,
        limit: Schema.optional(Schema.NumberFromString),
      },
      success: FileSearchResponse,
    }),
  )
  .add(
    HttpApiEndpoint.get("contentSearch", "/search/grep", {
      query: {
        q: Schema.String,
        mode: Schema.optional(Schema.String),
        limit: Schema.optional(Schema.NumberFromString),
      },
      success: ContentSearchResponse,
    }),
  ) { }


export class Api extends HttpApi.make("api").add(HealthApi, Search) { }
