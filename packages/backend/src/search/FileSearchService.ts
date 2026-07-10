import { Context, Effect, Schema } from "effect";

export const GrepModeSchema = Schema.Union([
  Schema.Literal("plain"),
  Schema.Literal("fuzzy"),
  Schema.Literal("regex"),
]);
export type GrepMode = typeof GrepModeSchema.Type;

export class FileSearchError extends Schema.TaggedErrorClass<FileSearchError>()("FileSearchError", {
  message: Schema.String,
}) {}

export class FileSearchService extends Context.Service<
  FileSearchService,
  {
    readonly fileSearch: (input: { query: string; limit?: number }) => Effect.Effect<
      {
        items: ReadonlyArray<{
          fileName: string;
          relativePath: string;
        }>;
        totalMatched: number;
      },
      FileSearchError
    >;

    readonly contentSearch: (input: {
      query: string;
      mode?: GrepMode;
      limit?: number;
    }) => Effect.Effect<
      {
        items: ReadonlyArray<{
          relativePath: string;
          lineNumber: number;
          lineContent: string;
        }>;
        totalMatched: number;
      },
      FileSearchError
    >;

    /** Rescan the extract-cache FileFinder after new `.txt` mirrors are written. */
    readonly refreshExtractIndex: () => Effect.Effect<void, FileSearchError>;
  }
>()("FileSearchService") {}
