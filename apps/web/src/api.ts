import { Api } from "@the-search-thing/backend/api";
import type { GrepMode } from "@the-search-thing/backend/api";
import { Effect, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

const runtime = ManagedRuntime.make(FetchHttpClient.layer);

const makeClient = HttpApiClient.make(Api);

export type { GrepMode };

export const searchFiles = (query: string, limit = 50) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* makeClient;
      return yield* client.search.fileSearch({
        query: { q: query, limit },
      });
    }),
  );

export const searchGrep = (query: string, mode: GrepMode = "plain", limit = 50) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* makeClient;
      return yield* client.search.contentSearch({
        query: { q: query, mode, limit },
      });
    }),
  );

export type FileSearchResult = Awaited<ReturnType<typeof searchFiles>>;
export type GrepSearchResult = Awaited<ReturnType<typeof searchGrep>>;
