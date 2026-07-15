import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { DocumentIndexError } from "./domain/DocumentIndexError.js";
import { FileSearchError, GrepModeSchema } from "./domain/FileSearchSchemas.js";
import {
  ContentSearchResponse,
  FileSearchResponse,
  HealthResponse,
  IndexRunResponse,
} from "./schemas.js";

export class HealthApi extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("healthz", "/healthz", {
    success: HealthResponse,
  }),
) {}

export class SearchApi extends HttpApiGroup.make("search")
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

export class Api extends HttpApi.make("api").add(HealthApi, SearchApi, IndexApi) {}
