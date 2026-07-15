import { Schema } from "effect";

export const GrepModeSchema = Schema.Union([
  Schema.Literal("plain"),
  Schema.Literal("fuzzy"),
  Schema.Literal("regex"),
]);
export type GrepMode = typeof GrepModeSchema.Type;

export class FileSearchError extends Schema.TaggedErrorClass<FileSearchError>()("FileSearchError", {
  message: Schema.String,
}) {}
