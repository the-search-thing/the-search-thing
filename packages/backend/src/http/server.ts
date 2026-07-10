import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { createServer } from "node:http";
import {
  Api,
  ContentSearchItem,
  ContentSearchResponse,
  FileSearchItem,
  FileSearchResponse,
  HealthResponse,
  IndexRunErrorItem,
  IndexRunResponse,
} from "./api.js";
import {
  DocumentIndexError,
  DocumentIndexLive,
  DocumentIndexService,
} from "../document/DocumentIndexService.js";
import { FileSearchLive } from "../search/FileSearchLive.js";
import { FileSearchService } from "../search/FileSearchService.js";

const HealthLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("healthz", () =>
    Effect.succeed(
      new HealthResponse({
        ok: true,
        service: "backend",
      }),
    ),
  ),
);

const SearchLive = HttpApiBuilder.group(
  Api,
  "search",
  Effect.fn(function* (handlers) {
    const search = yield* FileSearchService;
    return handlers
      .handle("fileSearch", ({ query }) =>
        Effect.gen(function* () {
          const result = yield* search.fileSearch({ query: query.q, limit: query.limit });
          return new FileSearchResponse({
            query: query.q,
            items: result.items.map((item) => new FileSearchItem(item)),
            totalMatched: result.totalMatched,
          });
        }),
      )
      .handle("contentSearch", ({ query }) =>
        Effect.gen(function* () {
          const result = yield* search.contentSearch({
            query: query.q,
            limit: query.limit,
            mode: query.mode,
          });
          return new ContentSearchResponse({
            query: query.q,
            mode: query.mode ?? "plain",
            items: result.items.map((item) => new ContentSearchItem(item)),
            totalMatched: result.totalMatched,
          });
        }),
      );
  }),
);

const IndexLive = HttpApiBuilder.group(
  Api,
  "index",
  Effect.fn(function* (handlers) {
    const index = yield* DocumentIndexService;
    const search = yield* FileSearchService;
    return handlers.handle("run", () =>
      Effect.gen(function* () {
        const result = yield* index.run();
        yield* search.refreshExtractIndex().pipe(
          Effect.mapError((error) =>
            DocumentIndexError.make({
              message: `Extract cache rescan failed: ${error.message}`,
            }),
          ),
        );
        return new IndexRunResponse({
          scanned: result.scanned,
          extracted: result.extracted,
          skipped: result.skipped,
          failed: result.failed,
          errors: result.errors.map((error) => new IndexRunErrorItem(error)),
        });
      }),
    );
  }),
);

const ApiLive = Layer.mergeAll(HealthLive, SearchLive, IndexLive).pipe(
  Layer.provide(Layer.mergeAll(FileSearchLive, DocumentIndexLive)),
);

const HttpLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(ApiLive),
  HttpRouter.serve,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
);

Layer.launch(HttpLive).pipe(NodeRuntime.runMain);
