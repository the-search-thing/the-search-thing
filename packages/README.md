# `packages/`

Shared libraries for the TypeScript rewrite. Apps (`apps/web`) and the server both depend on these workspace packages via pnpm.

## Layout

```
packages/
  api/       @the-search-thing/api   — HTTP contract (browser-safe)
  backend/   @the-search-thing/backend — Node server implementation
```

### `@the-search-thing/api`

The **contract** layer. Everything the client and server agree on:

- `Api.ts` — `HttpApi` definition (routes, methods, paths)
- `schemas.ts` — request/response `Schema.Class` types
- `domain/` — tagged errors and shared enums (`FileSearchError`, `GrepModeSchema`, …)

**Dependencies:** `effect` only. No Node APIs, no filesystem, no `@effect/platform-node`.

**Consumers:** `apps/web` (typed `HttpApiClient`), `packages/backend` (handlers + serialization).

### `@the-search-thing/backend`

The **implementation** layer. How the API actually runs on Node:

- `http/server.ts` — `HttpApiBuilder` handlers, HTTP server on port 3000
- `search/` — `FileSearchService` (interface) + `FileSearchLive` (FileFinder, grep)
- `document/` — indexing, extract cache, LiteParse

**Dependencies:** `@the-search-thing/api`, `@effect/platform-node`, `@ff-labs/fff-node`, `@llamaindex/liteparse`, …

**Consumers:** run directly (`pnpm --filter @the-search-thing/backend dev`). Not imported by the web app.

## Why split `api` from `backend`?

Effect’s HttpApi docs state that API definitions must stay **separate from server implementation** so they can be shared with clients without leaking server code. In a monorepo, that means a dedicated package.

Reference: `effect/ai-docs/src/51_http-server/10_basics.ts`

```
fixtures/api/     → HttpApi + schemas (shared)
fixtures/domain/  → errors, domain types
fixtures/server/  → handlers, services, Node/runtime code
```

We mirror that as `packages/api` (api + domain) and `packages/backend` (server).

## What this buys us

1. **Browser safety** — The web app imports only `@the-search-thing/api`. A single bad import from a service file (e.g. one that pulls in `node:fs`) used to crash Vite with a blank page. The package boundary makes that class of bug hard to write.

2. **One typed contract** — Server handlers and `HttpApiClient` both use the same `Api` class. Route or schema changes break at compile time on both sides.

3. **Clear dependencies** — Contract code depends on `effect` only. Node-only libraries stay in `backend`. Easy to see what runs where.

4. **Testability** — Handlers can be tested against the shared `Api` shape; the contract can be reviewed without reading filesystem code.

## Import rules

| From → To        | `api` | `backend` |
|------------------|-------|-----------|
| `apps/web`       | ✓     | ✗         |
| `backend`        | ✓     | —         |
| `api`            | —     | ✗         |

`api` must never import from `backend`. Errors and schemas live in `api/src/domain/`, not inside `*Service.ts` files that may later gain Node imports.

## Running locally

```bash
export SEARCH_ROOT="/path/to/your/files"
pnpm --filter @the-search-thing/backend dev   # :3000
pnpm --filter @the-search-thing/apps dev      # :5173, proxies /search → backend
```
