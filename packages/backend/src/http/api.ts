import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Schema } from "effect";
import { DocumentIndexError } from "../document/DocumentIndexService.js";
import { FileSearchError, GrepModeSchema } from "../search/FileSearchService.js";

export class HealthResponse extends Schema.Class<HealthResponse>("HealthResponse")({
  ok: Schema.Boolean,
  service: Schema.String,
}) {}

export class FileSearchItem extends Schema.Class<FileSearchItem>("FileSearchItem")({
  relativePath: Schema.String,
  fileName: Schema.String,
}) {}

export class FileSearchResponse extends Schema.Class<FileSearchResponse>("FileSearchResponse")({
  query: Schema.String,
  items: Schema.Array(FileSearchItem),
  totalMatched: Schema.Number,
}) {}

export class ContentSearchItem extends Schema.Class<ContentSearchItem>("ContentSearchItem")({
  relativePath: Schema.String,
  lineNumber: Schema.Number,
  lineContent: Schema.String,
}) {}

export class ContentSearchResponse extends Schema.Class<ContentSearchResponse>(
  "ContentSearchResponse",
)({
  query: Schema.String,
  items: Schema.Array(ContentSearchItem),
  totalMatched: Schema.Number,
  mode: GrepModeSchema,
}) {}

export class IndexRunErrorItem extends Schema.Class<IndexRunErrorItem>("IndexRunErrorItem")({
  path: Schema.String,
  message: Schema.String,
}) {}

export class IndexRunResponse extends Schema.Class<IndexRunResponse>("IndexRunResponse")({
  scanned: Schema.Number,
  extracted: Schema.Number,
  skipped: Schema.Number,
  failed: Schema.Number,
  errors: Schema.Array(IndexRunErrorItem),
}) {}

export class HealthApi extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("healthz", "/healthz", {
    success: HealthResponse,
  }),
) {}

export class Search extends HttpApiGroup.make("search")
  .add(
    HttpApiEndpoint.get("fileSearch", "/search/files", {
      query: {
        q: Schema.String,
        limit: Schema.optional(Schema.NumberFromString),
      },
      success: FileSearchResponse,
      error: FileSearchError,
    }),
  )
  .add(
    HttpApiEndpoint.get("contentSearch", "/search/grep", {
      query: {
        q: Schema.String,
        mode: Schema.optional(GrepModeSchema),
        limit: Schema.optional(Schema.NumberFromString),
      },
      success: ContentSearchResponse,
      error: FileSearchError,
    }),
  ) {}

export class IndexApi extends HttpApiGroup.make("index").add(
  HttpApiEndpoint.post("run", "/index/run", {
    success: IndexRunResponse,
    error: DocumentIndexError,
  }),
) {}

export class Api extends HttpApi.make("api").add(HealthApi, Search, IndexApi) {}
