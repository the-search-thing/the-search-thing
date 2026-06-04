---
name: helix-memory-system
description: Design and operate an advanced AI agent memory system on HelixDB using hybrid graph + vector + BM25 search. Use when building long-term memory, user profiles, document/chunk RAG, recall/remember features, memory extraction, deduplication, consolidation, versioning, updating, forgetting/deletion, categorisation, or connector-backed ingestion. Covers tenant-safe Helix data modeling, modality decision rules, the full write/maintain lifecycle, and the product layers an agent must implement around Helix. TypeScript-first (@helixdb/enterprise-ql); a Rust DSL variant is in EXAMPLES.rust.md.
license: MIT
metadata:
  author: HelixDB
  version: 0.2.0
---

# Helix Memory System

Build a durable, per-tenant agent memory platform on Helix that combines **graph relationships**, **vector similarity**, and **BM25 full-text** in one database. This skill covers the whole memory lifecycle: raw context ingestion, extraction, memory generation, deduplication, updating/versioning, deletion/forgetting, categorisation, profile maintenance, and hybrid retrieval.

Helix is the storage and retrieval engine. A complete memory product also needs application workers for extraction, chunking, embeddings, relationship classification, reranking, connector sync, and profile summarisation.

## When To Use

Use this skill when the task is to:

- design the data model for agent memory, long-term memory, user profiles, document/chunk RAG, or a "remember what the user told me" feature
- write queries that create, deduplicate, reinforce, consolidate, version, correct, expire, forget, categorise, or retrieve memories
- decide which Helix capability (property index, graph edge, vector index, BM25 text index) a given memory operation should use
- build hybrid recall that fuses semantic + keyword + graph + profile context
- implement advanced memory components such as source documents, chunks, connectors, extracted facts, evolving profiles, relationship-aware recall, and forgetting

Do **not** use this skill for generic query syntax questions. For builder/method details defer to `helix-query-typescript` (the default DSL), `helix-query-rust`, or `helix-query-json-dynamic`. This skill assumes those and focuses on the memory architecture on top of Helix.

## First Steps

1. Inspect the target repo for existing labels, edges, properties, indexes, and route style. Reuse exact casing if present.
2. **Default to the TypeScript DSL** (`@helixdb/enterprise-ql`) so the app can keep query generation near service code. Use `EXAMPLES.rust.md` only if the runtime is Rust or the team explicitly ships Rust stored routes.
3. Decide the tenancy boundary before modeling anything. The canonical tenant property is **`tenant_id`** because tenant-partitioned Helix text indexes currently require that name. Attach `tenant_id` to every tenant-owned node and edge.
4. Decide the memory visibility boundary separately from tenancy. In most apps, `tenant_id` partitions indexes while `userId`, `containerId`, `projectId`, or an app ACL decides which memories can be recalled. Default examples use `userId` as the second-level scope.
5. Reuse the canonical model below before inventing labels. Adapt names, not the shape.
6. Confirm how embeddings are produced. **Default to OpenAI `text-embedding-3-small`** for production and benchmarkable memory systems: `1536` dimensions, stored as `F32` arrays. The application computes embeddings client-side and passes numeric arrays (`param.array(param.f32())`). Helix does **not** embed text on the dynamic-query path; there is no `Embed()`/`SearchV` in the current DSL. Keep embedding model and dimension fixed for each vector index. Deterministic hash embeddings are acceptable only for local UI demos or smoke tests, not for quality benchmarks.
7. Identify the application workers outside Helix: extractor, chunker, embedder, memory writer, relationship classifier, decay/expiry sweeper, profile summariser, optional query rewriter, optional reranker, and connector sync jobs.

## The Memory Model At A Glance

Core labels: **`Tenant`**, **`User`**, **`UserProfile`**, **`SourceDocument`**, **`Chunk`**, **`Memory`**, **`Category`**, **`Entity`**, **`Session`**, optional **`Connector`** and **`IngestionJob`**.

Core edges: **`OWNS`** (Tenant/User→Memory), **`HAS_PROFILE`** (User→UserProfile), **`HAS_CHUNK`** (SourceDocument→Chunk), **`EXTRACTED_FROM`** (Memory→Chunk or SourceDocument), **`IN_CATEGORY`** (Memory→Category), **`MENTIONS`** (Memory→Entity), **`UPDATES`** (new Memory→old Memory), **`EXTENDS`** (Memory→Memory enrichment), **`DERIVES`** (inferred Memory→supporting Memory), **`RELATES_TO`** (Memory→Memory association), **`DERIVED_FROM`** (Memory→Session), optional **`PARENT_OF`** (Category→Category).

Fast and safe fields:

- `tenant_id` on every tenant-owned node and edge, with equality indexes where used as an anchor
- `userId` or an equivalent scope key on user/container-specific memories, source documents, and chunks; only intentionally shared records should be tenant-wide
- stable IDs such as `memoryId`, `documentId`, `chunkId`, `categoryKey`, `entityKey`, `sessionId`, and `profileId`
- `Memory.isLatest`, `validFrom`, `validTo`, `expiresAt`, and `deletedAt` for record lifecycle filtering
- optional real-world temporal fields such as `observedAt`, `eventStartAt`, `eventEndAt`, `temporalText`, and `timezone` when the memory is about a dated event or fact
- tenant-partitioned vector/text indexes on `Memory.embedding`/`Memory.content` and optionally `Chunk.embedding`/`Chunk.content`, all partitioned by `tenant_id`

Full spec, types, and index bootstrap are in `REFERENCE.md`.

## Modality Decision Rules

Pick the mechanism by the question you are answering, and combine them deliberately:

| Need | Use | Why |
|---|---|---|
| Tenant isolation (`tenant_id`), exact identity, lifecycle flags (`deletedAt`, `expiresAt`, `validTo`, `isLatest`), ordering/filtering (`createdAt`, `salience`) | **Properties + equality/range index** | Narrow anchors and safe filters. Tenant scope is non-negotiable. |
| Categorisation, entities, provenance, profile ownership, updates/extensions/derivations, association clusters, taxonomy | **Graph edges** | These are relationships; traverse and aggregate over them. |
| Deduplication, paraphrase recall, memories like this, chunks like this | **Vector search** | Semantic similarity; tolerant of rewording. |
| Exact names, ids, rare tokens, commands, file paths, product terms | **BM25 text search** | Embeddings blur exact tokens; BM25 preserves them. |
| Broad user context the model should always know | **UserProfile node + summariser worker** | Avoid multiple searches for stable identity/preferences/recent focus. |
| Raw documents and citations | **SourceDocument + Chunk nodes** | Memory facts are not a replacement for source-grounded RAG. |

Rule of thumb: **never collapse a memory system to vector-only.** Vectors miss exact names and have no notion of ownership, recency, contradiction, provenance, profile state, or category.

Always scope vector/BM25 searches with `tenantValue = tenant_id`. Tenant scope is necessary but not always sufficient: default user-memory recall must also filter by `userId` or the app's equivalent container/ACL unless the record is explicitly shared tenant-wide. Every recall path must filter out forgotten/stale records: `deletedAt IsNull`, `isLatest = true`, `validTo IsNull`, and `expiresAt` absent or in the future. If a route cannot express one of those filters inside Helix, over-fetch and apply the remaining policy in application code before returning context.

## Product Layers

Helix gives you graph + search primitives. A full intelligent memory system also needs:

| Layer | Responsibility |
|---|---|
| Ingestion API | Accept text, chats, files, URLs, connector events, and direct memory writes. |
| Extractors | Convert PDFs, docs, HTML, images/OCR, audio/video transcripts, code, and structured data into text. |
| Chunkers | Split raw context by semantic sections, message turns, document headings, code AST boundaries, or transcript segments. |
| Embedding worker | Generate `text-embedding-3-small` 1536-dim `F32` embeddings for memories and chunks before writing to Helix, unless the app has explicitly standardised on another model. |
| Memory generator | Extract atomic, entity-centric candidate facts from conversations/documents using the current turn plus recent context, active entities, recalled memories, and current date. |
| Relationship classifier | Decide whether each candidate `UPDATES`, `EXTENDS`, `DERIVES`, duplicates, or stands alone. |
| Profile summariser | Maintain `UserProfile.staticSummary` and `dynamicSummary` from latest memories. |
| Forgetting jobs | Run expiry, decay, stale-profile, and connector deletion sweeps. |
| Retrieval service | Rewrite queries, run vector + BM25 over memories/chunks, fuse, rerank, graph-expand, and pack context with citations. |
| Evaluation | Measure recall quality, stale-memory suppression, tenant isolation, latency, and token efficiency. |

Do not imply Helix automatically does extraction, chunking, embedding, relationship classification, profile generation, connector sync, reranking, or TTL. Those are application responsibilities unless the user has a managed service that provides them.

## The Memory Lifecycle

Each step links to complete examples in `EXAMPLES.md` (TypeScript) and `EXAMPLES.rust.md` (Rust).

### 1. Ingestion & Generation

1. Accept raw context as a `SourceDocument`, conversation/session, direct memory write, or connector update.
2. Extract and chunk app-side when the input is not already an atomic memory.
3. Embed each candidate memory/chunk app-side with OpenAI `text-embedding-3-small` by default. Store/pass a 1536-length `F32` vector.
4. Extract atomic, self-contained candidate memories. Prefer entity-centric facts: "Alex prefers morning meetings" rather than "prefers morning meetings".
5. Classify candidate kind: `fact`, `preference`, `episode`, `procedure`, or app-specific equivalents.
6. Deduplicate before writing. A similarity threshold cannot be a batch condition, so use read-then-write for semantic dedup and idempotent upsert for exact repeats.
7. Write `Memory` with `tenant_id`, `memoryId`, `content`, `embedding`, `kind`, `salience`, `isLatest: true`, and lifecycle timestamps; link ownership and provenance edges.
8. Categorise and entity-link immediately.

### Contextual Extraction Rules

Do not extract from the latest user message in isolation. The extraction worker should receive:

- the current user message
- the previous assistant message, because it often defines what a short answer means
- a bounded recent conversation window
- recalled active memories and active entities
- the current date/time for relative time phrases
- the memory scope (`tenant_id` plus `userId`, `containerId`, `projectId`, or ACL context)

Resolve pronouns, ellipsis, and short follow-up answers before deciding whether to store a memory. If the assistant asks a memory-bearing follow-up question and the user answers briefly, convert the answer into a self-contained memory.

Extractor output should be structured enough for deterministic writes: `shouldStore`, self-contained `content`, `kind`, `confidence`, `salience`, `entities`, `source` pointers, `scope`, optional temporal fields, and a relationship decision (`new`, `duplicate`, `EXTENDS`, `UPDATES`, or `DERIVES`). Do not let a single vector-distance threshold decide updates; retrieve candidates with vector + BM25 and adjudicate exact duplicate vs update vs extension in application code.

Example:

```text
Existing memory: User is planning a trip to Japan with Maya.
Assistant: When are you going?
User: next April
Extract: User is planning a trip to Japan with Maya next April.
Relationship: EXTENDS the existing Japan trip memory; MENTIONS Maya and Japan.

Assistant: What do you want to do there?
User: mostly food, temples, and trains
Extract: User wants their Japan trip with Maya to focus on food, temples, and trains.
Relationship: EXTENDS the existing Japan trip memory; categorise as travel/preferences.

User later: actually we're going in May instead
Extract: User is planning a trip to Japan with Maya in May.
Relationship: UPDATES the previous next-April timing memory and invalidates the older version.
```

### 2. Updating & Versioning

- **Reinforce on access:** bump `accessCount`, `lastAccessedAt`, and bounded `salience`.
- **Update/correct:** create a new memory, link `new -UPDATES-> old`, set old `isLatest = false` and `validTo`, and optionally set `deletedAt` if it should disappear from normal recall.
- **Extend:** link `new -EXTENDS-> existing` when the new fact enriches but does not replace the old fact.
- **Derive:** link inferred facts with `DERIVES` edges to supporting memories and mark them as inferred with confidence metadata.
- If `content` changes, re-embed and update `embedding` in the same write. Content and vector must never drift.
- Keep lifecycle validity (`validFrom`, `validTo`, `deletedAt`) separate from real-world event time (`eventStartAt`, `eventEndAt`, `temporalText`). Updating a memory because a fact changed should invalidate the old record even if both facts refer to future or past dates.

### 3. Deletion / Forgetting

Helix has **no native TTL or decay**. Forgetting is explicit write queries the app runs.

- **Soft-delete** (preferred): set `deletedAt = Expr.datetime()` and filter it from reads. Reversible and audit-friendly.
- **Version invalidation:** set `isLatest = false` and `validTo = Expr.datetime()` when a memory is superseded.
- **Expiry sweep:** hide or hard-delete memories where `expiresAt < now`.
- **Decay sweep:** hide weak, stale, rarely accessed episodic memories.
- **Hard delete:** use `drop()` only when policy requires physical deletion. `drop()` removes the node and incident edges; use `dropEdgeById` for surgical edge cleanup on multigraph-sensitive paths.

### 4. Categorisation & Entity Linking

- Store display categories as `Category` nodes scoped by `tenant_id` and a unique `categoryKey` such as `${tenant_id}:${normalisedName}`.
- Store entities as `Entity` nodes scoped by `tenant_id` and a unique `entityKey` such as `${tenant_id}:${normalisedName}`.
- Prefer edges over arrays when you will traverse, aggregate, or recall by the tag/entity.
- Use array/string metadata only for flat display filters that do not need graph expansion.

### 5. Profile Maintenance

- Maintain one `UserProfile` per user/container with `profileId`, `tenant_id`, `userId`, `staticSummary`, `dynamicSummary`, and `updatedAt`.
- Static profile: identity, stable preferences, long-lived background.
- Dynamic profile: current projects, recent context, temporary goals, unresolved tasks.
- Update profiles asynchronously after memory writes and deletions; keep profile generation deterministic enough to test.

### Retrieval

Run multiple recall paths and fuse app-side:

1. Fetch the `UserProfile` for always-on context.
2. Run vector and BM25 over current `Memory` nodes, tenant-scoped, user/container-scoped, and freshness-filtered.
3. Optionally run vector and BM25 over `Chunk` nodes for source-grounded RAG and citations, with the same owner/scope policy unless documents are intentionally shared.
4. Fuse app-side with RRF, then re-rank by salience, recency, relationship type, and optional cross-encoder score.
5. Expand top memories through `MENTIONS`, `IN_CATEGORY`, `EXTENDS`, `UPDATES`, and `RELATES_TO`, bounded by depth and tenant filters.
6. Pack context without embeddings and include source/citation metadata when available.

## Anti-Patterns

Do not:

- use the deprecated `.hx` dialect (`Embed()`, `SearchV`, `SearchBM25`, `AddV`) for new dynamic/TS/Rust DSL work
- use `userId` as the text-index tenant property; use `tenant_id` for tenant-partitioned text/vector indexes
- assume `tenant_id` alone is a safe recall boundary for org/team tenants; filter by `userId`, `containerId`, project ACLs, or an explicit shared-memory flag
- attach `tenant_id` only to `Memory`; every tenant-owned node and edge needs it
- mutate, delete, categorise, or reinforce by `memoryId` without also checking `tenant_id`
- return superseded/forgotten/expired memories because recall only checked `deletedAt`
- mix lifecycle timestamps (`validTo`, `deletedAt`) with real-world event dates; use separate temporal fields for memories about trips, deadlines, appointments, or historical facts
- build a vector-only store and call it memory
- use a toy hash embedding for production recall or benchmark claims; default to `text-embedding-3-small` unless the app has a better standard model
- decide dedup/update/extension by vector threshold alone; use exact checks, BM25 candidates, vector candidates, and app/LLM adjudication
- extract memories from only the latest user message and miss contextual follow-ups such as "next April" or "mostly food, temples, and trains"
- drop short follow-up answers because they are not self-contained before context resolution
- write user-specific chunks/documents without an owner or scope field, then recall them tenant-wide
- expect Helix to extract files, chunk documents, generate embeddings, classify updates, build profiles, rerank, sync connectors, or run TTL jobs automatically
- read `$distance` after an `out`/`in`/`both` step; project it immediately after search
- try to express a similarity-threshold dedup as a `BatchCondition`; it can only test variable emptiness/size
- update `content` without re-embedding
- return `embedding` arrays in API responses unless explicitly required
- make `Category` or `Entity` global by display name in a multi-tenant memory app

## Validation Checklist

Before finishing:

- `readBatch()` vs `writeBatch()` is correct
- every tenant-owned node and edge has `tenant_id`
- vector/text indexes use `tenant_property = "tenant_id"`, and searches pass `tenantValue = tenant_id`
- every memory read filters `tenant_id`, user/container visibility, `deletedAt IsNull`, current/latest state, and expiry validity
- every write route accepts and filters by `tenant_id`
- IDs used for upsert are either globally unique or tenant-qualified (`categoryKey`, `entityKey`, etc.)
- user/container-specific documents and chunks carry the same owner/scope fields used by recall, or are explicitly marked/shared through app policy
- lifecycle validity fields are not overloaded as event-time fields; dated facts use `observedAt`, `eventStartAt`, `eventEndAt`, `temporalText`, or app equivalents
- embedding model is `openai:text-embedding-3-small` and every vector is 1536-dim `F32`, unless the app explicitly standardises on another fixed model/dimension
- content edits re-embed in the same write
- generation deduplicates semantically and exact repeats are idempotent
- extraction sees the previous assistant turn, recent conversation window, recalled active memories/entities, and current date before deciding what to store
- extraction emits a structured relationship/scope/source/temporal decision that can be tested deterministically
- source documents/chunks exist if the feature promises citations or RAG over raw context
- user profile update jobs exist if the feature promises always-on personalization
- evaluation covers tenant isolation, user/container isolation, stale-memory suppression, contextual follow-up extraction, exact-token recall, temporal corrections, deletion, profile rebuilds, latency, and token budget
- timestamps use one consistent convention; this skill uses typed DateTime via `Expr.datetime()` and `param.dateTime()`
- no projected output includes `embedding` unless explicitly required
- labels/edges/properties match existing repo casing

## Reference Files

- `REFERENCE.md` — full data-model spec, tenant rules, indexes, modality cheat-sheet, embedding guidance, fusion/re-ranking formula, and TypeScript ↔ Rust API mapping.
- `EXAMPLES.md` — lifecycle scenarios as `@helixdb/enterprise-ql` TypeScript snippets. **Default.**
- `EXAMPLES.rust.md` — the same scenarios in the Rust DSL.
- Adjacent skills: `helix-query-typescript`, `helix-query-rust`, `helix-query-json-dynamic`, `helix-query-optimize`.
