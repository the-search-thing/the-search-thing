import { Context, Effect } from "effect";
import { FileSearchError, type GrepMode } from "@the-search-thing/api";

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
