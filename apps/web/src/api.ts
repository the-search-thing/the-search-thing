import { Api } from "@the-search-thing/api";
import { Effect, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

const runtime = ManagedRuntime.make(FetchHttpClient.layer);

const makeClient = HttpApiClient.make(Api);

export const searchFiles = (query: string, limit = 50, signal?: AbortSignal) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* makeClient;
      return yield* client.search.fileSearch({
        query: { q: query, limit },
      });
    }),
    { signal },
  );

export const searchGrep = (query: string, limit = 50, signal?: AbortSignal) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* makeClient;
      return yield* client.search.contentSearch({
        query: { q: query, mode: "fuzzy", limit },
      });
    }),
    { signal },
  );

export type FileSearchResult = Awaited<ReturnType<typeof searchFiles>>;
export type GrepSearchResult = Awaited<ReturnType<typeof searchGrep>>;
