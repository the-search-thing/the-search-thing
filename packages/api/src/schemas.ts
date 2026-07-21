import { Schema } from "effect";
import { GrepModeSchema } from "./domain/FileSearchSchemas.js";

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
  pruned: Schema.Number,
  errors: Schema.Array(IndexRunErrorItem),
}) {}
