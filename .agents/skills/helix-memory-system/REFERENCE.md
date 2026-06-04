# Helix Memory System — Reference

Data model, tenant rules, indexes, modality cheat-sheet, embedding rules, fusion formula, and TypeScript ↔ Rust API mapping. Authoring rules are in `SKILL.md`; runnable queries are in `EXAMPLES.md` (TS) / `EXAMPLES.rust.md`.

## Design Target

This model supports an intelligent memory product, not just vector recall:

- extracted user memories that evolve over time
- source documents and chunks for RAG/citations
- graph relationships for updates, extensions, derivations, entities, categories, and provenance
- user profiles for always-on personalization
- tenant-safe vector and BM25 retrieval
- explicit forgetting and lifecycle sweeps

Helix stores and searches the graph. Extraction, chunking, embedding, connector sync, relationship classification, profile summarisation, reranking, and scheduled sweeps are application workers.

## Tenant Rules

Use **`tenant_id`** as the canonical tenant property.

Reasons:

- tenant-partitioned Helix text indexes currently require the tenant property name to be `tenant_id`
- vector and text searches use the same partition key
- row-level isolation is application-enforced, so every query and write must carry tenant scope

Rules:

- attach `tenant_id` to every tenant-owned node: `User`, `UserProfile`, `SourceDocument`, `Chunk`, `Memory`, `Category`, `Entity`, `Session`, `Connector`, `IngestionJob`
- attach `tenant_id` to every tenant-owned edge that carries properties or can be traversed broadly
- filter every read and write by `tenant_id`, even when the ID is expected to be globally unique
- use tenant-qualified unique keys where the natural display name or external id is not globally unique, such as `categoryKey = tenant_id + ":" + normalisedName`
- pass `tenantValue = tenant_id` to every tenant-partitioned vector/text search

## Scope & Visibility Rules

`tenant_id` is the Helix search partition key. It is not automatically the user's recall boundary.

Default user-memory policy:

```text
tenant_id == request.tenant_id
userId == request.userId
record is current and not deleted/expired
```

Use a different or additional scope key when the product stores team, project, workspace, channel, or agent-container memory. Common fields are `containerId`, `projectId`, `scopeId`, `visibility`, and app-side ACL ids. Keep tenant-scoped vector/BM25 search, then filter the returned records by the app's visibility policy before context packing.

Only intentionally shared records should be tenant-wide. Mark them explicitly with fields such as `visibility = "tenant"` or put them in a separate shared-memory path; do not rely on omitted `userId` as an implicit sharing signal.

Unique-indexed ids (`memoryId`, `profileId`, `documentId`, `chunkId`, `sessionId`) must be globally unique within the database or tenant-qualified before insertion, for example `${tenant_id}:${externalId}`. If an external connector emits ids that repeat across tenants, never store the raw external id as a unique-indexed property.

## Data Model

Helix is schema-on-write for labels and properties, but **indexes are explicit**. Create them once before relying on them.

### Labels

**`Tenant`** — optional logical container for an org, user, project, or workspace.

| Property | Type | Index | Notes |
|---|---|---|---|
| `tenant_id` | String | unique equality | Search partition key and row-scope key. |
| `name` | String | — | Optional display name. |
| `createdAt` | DateTime | — | `Expr.datetime()` at insert. |

**`User`** — human/user entity inside a tenant.

| Property | Type | Index | Notes |
|---|---|---|---|
| `userKey` | String | unique equality | Tenant-qualified key, e.g. `${tenant_id}:${userId}`. |
| `tenant_id` | String | equality | Tenant scope. |
| `userId` | String | equality | App/user id, not assumed globally unique. |
| `name` | String | — | Optional display name. |
| `createdAt` | DateTime | — | Insert time. |

**`UserProfile`** — maintained summary/context provider for a user or container.

| Property | Type | Index | Notes |
|---|---|---|---|
| `profileId` | String | unique equality | Stable profile id. |
| `tenant_id` | String | equality | Tenant scope. |
| `userId` | String | equality | User/container id. |
| `staticSummary` | String | text optional | Long-lived facts/preferences/background. |
| `dynamicSummary` | String | text optional | Current projects, short-term goals, recent state. |
| `updatedAt` | DateTime | — | Last summariser update. |

**`SourceDocument`** — raw ingested context: text, URL, file, connector document, or conversation transcript.

| Property | Type | Index | Notes |
|---|---|---|---|
| `documentId` | String | unique equality | Stable source id. |
| `tenant_id` | String | equality | Tenant scope. |
| `userId` | String | equality optional | Owner when the document is user/container-specific. Required by the default examples. |
| `scopeId` | String | equality optional | Project/workspace/container scope when `userId` is not the right visibility key. |
| `visibility` | String | equality optional | `user`, `container`, `tenant`, or app-specific. Do not omit scope for private documents. |
| `sourceType` | String | equality optional | `text`, `chat`, `pdf`, `url`, `connector`, etc. |
| `title` | String | text optional | Display/source title. |
| `uri` | String | equality optional | URL, file path, connector resource id. |
| `checksum` | String | equality optional | Idempotent ingestion/update detection. |
| `status` | String | equality optional | `queued`, `extracting`, `chunking`, `indexed`, `failed`. |
| `createdAt` / `updatedAt` | DateTime | — | Lifecycle timestamps. |
| `deletedAt` | DateTime | — | Soft-delete tombstone. |

**`Chunk`** — searchable source-grounded RAG unit.

| Property | Type | Index | Notes |
|---|---|---|---|
| `chunkId` | String | unique equality | Stable chunk id. |
| `tenant_id` | String | equality | Tenant scope. |
| `userId` | String | equality optional | Owner copied from the source document for default user-scoped recall. |
| `scopeId` | String | equality optional | Project/workspace/container scope copied from the source document. |
| `visibility` | String | equality optional | `user`, `container`, `tenant`, or app-specific. |
| `documentId` | String | equality | Source pointer. |
| `content` | String | **text (BM25), tenant_property `tenant_id`** | Chunk text. |
| `embedding` | F32Array | **vector, tenant_property `tenant_id`** | Client-computed embedding of `content`. Default: OpenAI `text-embedding-3-small`, 1536 dims. |
| `embeddingModel` | String | — | Optional per-record audit value, e.g. `openai:text-embedding-3-small`. Usually also stored in app config. |
| `embeddingDim` | I64 | — | Optional per-record audit value. Default `1536`. |
| `ordinal` | I64 | range optional | Position in document. |
| `metadataJson` | String | — | Flattened metadata when complex metadata is needed. Helix properties are flat. |
| `createdAt` / `updatedAt` | DateTime | — | Lifecycle timestamps. |
| `deletedAt` | DateTime | — | Soft-delete tombstone. |

**`Memory`** — extracted/evolved memory fact.

| Property | Type | Index | Notes |
|---|---|---|---|
| `memoryId` | String | unique equality | App-generated stable id (uuid or content hash). |
| `tenant_id` | String | equality | Tenant scope and search partition value. |
| `userId` | String | equality | User/container id for profile grouping. |
| `scopeId` | String | equality optional | Project/workspace/container scope if recall is not purely per-user. |
| `visibility` | String | equality optional | `user`, `container`, `tenant`, or app-specific shared/private policy. |
| `content` | String | **text (BM25), tenant_property `tenant_id`** | Human-readable memory text. |
| `embedding` | F32Array | **vector, tenant_property `tenant_id`** | Client-computed embedding of `content`. Default: OpenAI `text-embedding-3-small`, 1536 dims. |
| `embeddingModel` | String | — | Optional per-record audit value, e.g. `openai:text-embedding-3-small`. Usually also stored in app config. |
| `embeddingDim` | I64 | — | Optional per-record audit value. Default `1536`. |
| `kind` | String | equality optional | `fact`, `preference`, `episode`, `procedure`, or app-specific. |
| `salience` | F64 | range optional | Importance 0..1; drives reranking and decay. |
| `confidence` | F64 | range optional | Extraction/classification confidence. |
| `isLatest` | Bool | equality optional | `true` for current version. Recall filters to true. |
| `isStatic` | Bool | equality optional | Permanent/identity-like memory for profile behaviour. |
| `inferred` | Bool | equality optional | True for `DERIVES` outputs. |
| `createdAt` | DateTime | — | Insert time. |
| `updatedAt` | DateTime | — | Last content/embedding change. |
| `lastAccessedAt` | DateTime | — | Bumped on reinforcement. |
| `accessCount` | I64 | — | Bumped on reinforcement. |
| `validFrom` / `validTo` | DateTime | — | Record lifecycle validity; `validTo` is set when superseded/invalidated. Do not use these as event dates. |
| `expiresAt` | DateTime | range optional | Optional expiry target for sweeps. |
| `deletedAt` | DateTime | — | Soft-delete tombstone. Every recall filters this null. |
| `sourceSessionId` | String | equality optional | Conversation/session provenance. |
| `sourceMessageId` | String | equality optional | Specific chat message provenance when available. |
| `documentId` / `chunkId` | String | equality optional | Source/citation pointer. |
| `observedAt` | DateTime | range optional | When the app observed or extracted the fact, if different from `createdAt`. |
| `eventStartAt` / `eventEndAt` | DateTime | range optional | Real-world time window the memory is about, such as a trip or appointment. |
| `temporalText` | String | — | Original normalized time phrase, e.g. `next April`, when exact dates are unknown. |
| `timezone` | String | — | Timezone used to resolve relative times. |

**`Category`** — topic taxonomy scoped to a tenant.

| Property | Type | Index | Notes |
|---|---|---|---|
| `categoryKey` | String | unique equality | `${tenant_id}:${normalisedName}`. |
| `tenant_id` | String | equality | Tenant scope. |
| `name` | String | equality | Display name. |
| `description` | String | — | Optional. |

**`Entity`** — people/places/things mentioned, scoped to a tenant.

| Property | Type | Index | Notes |
|---|---|---|---|
| `entityKey` | String | unique equality | `${tenant_id}:${normalisedName}`. |
| `tenant_id` | String | equality | Tenant scope. |
| `name` | String | equality | Display name. |
| `entityType` | String | equality optional | Person/org/place/product/etc. |

**`Session`** — episodic provenance.

| Property | Type | Index | Notes |
|---|---|---|---|
| `sessionId` | String | unique equality | Stable conversation/session id. |
| `tenant_id` | String | equality | Tenant scope. |
| `userId` | String | equality optional | Associated user/container. |
| `startedAt` / `endedAt` | DateTime | — | Session bounds. |

**`Connector`** and **`IngestionJob`** are optional operational nodes. Use them to model OAuth/provider state, sync cursors, document limits, job status, error messages, and schedule metadata when building connector-backed ingestion.

### Edges

| Edge | From → To | Properties | Purpose |
|---|---|---|---|
| `OWNS` | Tenant/User → Memory | `tenant_id`, `createdAt` | Ownership and user memory listing. |
| `HAS_PROFILE` | User → UserProfile | `tenant_id` | User profile lookup via graph. |
| `HAS_DOCUMENT` | Tenant/User → SourceDocument | `tenant_id` | Source ownership. |
| `HAS_CHUNK` | SourceDocument → Chunk | `tenant_id`, `ordinal` | Document-to-chunk provenance. |
| `EXTRACTED_FROM` | Memory → Chunk or SourceDocument | `tenant_id`, `confidence` | Citation/source traceability. |
| `IN_CATEGORY` | Memory → Category | `tenant_id`, `confidence` | Topic categorisation. |
| `MENTIONS` | Memory/Chunk → Entity | `tenant_id`, `role` | Entity-centric recall and expansion. |
| `UPDATES` | Memory → Memory | `tenant_id`, `reason`, `at` | New memory replaces/contradicts old. |
| `EXTENDS` | Memory → Memory | `tenant_id`, `confidence`, `at` | New memory enriches old without replacing it. |
| `DERIVES` | Memory → Memory | `tenant_id`, `confidence`, `at` | Inferred memory derived from support. |
| `RELATES_TO` | Memory → Memory | `tenant_id`, `kind`, `confidence` | Association/consolidation cluster. |
| `DERIVED_FROM` | Memory → Session | `tenant_id` | Conversation/session provenance. |
| `PARENT_OF` | Category → Category | `tenant_id` | Optional hierarchical taxonomy. |

### Index Bootstrap

Create these from a **write** batch before generation/retrieval:

- `IndexSpec.nodeUniqueEquality("Tenant", "tenant_id")`
- `IndexSpec.nodeUniqueEquality("User", "userKey")`
- `IndexSpec.nodeEquality("User", "tenant_id")`
- `IndexSpec.nodeEquality("User", "userId")`
- `IndexSpec.nodeUniqueEquality("UserProfile", "profileId")`
- `IndexSpec.nodeEquality("UserProfile", "tenant_id")`
- `IndexSpec.nodeEquality("UserProfile", "userId")`
- `IndexSpec.nodeUniqueEquality("SourceDocument", "documentId")`
- `IndexSpec.nodeEquality("SourceDocument", "tenant_id")`
- `IndexSpec.nodeEquality("SourceDocument", "userId")`
- `IndexSpec.nodeEquality("SourceDocument", "checksum")`
- `IndexSpec.nodeUniqueEquality("Chunk", "chunkId")`
- `IndexSpec.nodeEquality("Chunk", "tenant_id")`
- `IndexSpec.nodeEquality("Chunk", "userId")`
- `IndexSpec.nodeEquality("Chunk", "documentId")`
- `IndexSpec.nodeVector("Chunk", "embedding", "tenant_id")`
- `IndexSpec.nodeText("Chunk", "content", "tenant_id")`
- `IndexSpec.nodeUniqueEquality("Memory", "memoryId")`
- `IndexSpec.nodeEquality("Memory", "tenant_id")`
- `IndexSpec.nodeEquality("Memory", "userId")`
- `IndexSpec.nodeEquality("Memory", "isLatest")`
- `IndexSpec.nodeRange("Memory", "eventStartAt")` when temporal/event recall is needed
- `IndexSpec.nodeVector("Memory", "embedding", "tenant_id")`
- `IndexSpec.nodeText("Memory", "content", "tenant_id")`
- `IndexSpec.nodeUniqueEquality("Category", "categoryKey")`
- `IndexSpec.nodeEquality("Category", "tenant_id")`
- `IndexSpec.nodeUniqueEquality("Entity", "entityKey")`
- `IndexSpec.nodeEquality("Entity", "tenant_id")`
- `IndexSpec.nodeUniqueEquality("Session", "sessionId")`
- `IndexSpec.nodeEquality("Session", "tenant_id")`
- `IndexSpec.nodeEquality("Session", "userId")`

The `tenant_property` on vector/text indexes must be the property name (`tenant_id`), and query-time `tenantValue` must be the tenant value. Tenant-scoped search against a tenant-partitioned index without a tenant value returns no useful results.

## Current Scoped Memory Filter

Every normal user-memory recall path should return only visible live/current memories:

```text
tenant_id == request.tenant_id
userId == request.userId       # or the app's container/ACL visibility predicate
deletedAt IS NULL
isLatest == true
validTo IS NULL
expiresAt IS NULL OR expiresAt > now
```

Helix can express these as `where(Predicate.and([...]))` after a vector/text search. If a route cannot express a future-time or ACL condition because of local builder limitations, over-fetch and filter in application code before context packing. Never return records that fail scope or lifecycle policy just because they appeared in a tenant-scoped ANN/BM25 result set.

## Modality Cheat-Sheet

| Question | Mechanism | Builder |
|---|---|---|
| Which tenant/user/exact memory? | property + equality index | `nWithLabelWhere("Memory", SourcePredicate.eq("tenant_id", p.tenant_id))` |
| Which user/container can see it? | scope properties + app ACL | `Predicate.eqParam("userId", "userId")` or app-specific `scopeId`/ACL filtering |
| Is this current and recallable? | lifecycle properties | `where(Predicate.isNull("deletedAt"))`, `Predicate.eq("isLatest", true)`, `Predicate.isNull("validTo")` |
| What category/entity/source/session relates these? | edges | `out("IN_CATEGORY")`, `out("MENTIONS")`, `out("EXTRACTED_FROM")`, `out("DERIVED_FROM")` |
| Did information change? | version edges | `out("UPDATES")`, `in("UPDATES")`, plus `isLatest`/`validTo` |
| What is semantically similar/already known? | vector | `vectorSearchNodesWith("Memory", "embedding", p.embedding, p.k, p.tenant_id)` |
| What contains exact words/names/ids? | BM25 text | `textSearchNodesWith("Memory", "content", p.query, p.k, p.tenant_id)` |
| What source passages support this? | chunk search + provenance edges | search `Chunk`, then `in("EXTRACTED_FROM")` or `out("HAS_CHUNK")` |
| What should the model always know? | profile node | lookup `UserProfile` by `tenant_id` + `userId` |

`$distance` (smaller = closer for vector and BM25) is only available immediately after the search step and survives `where` filters, but is dropped by traversal (`out`/`in`/`both`). Project it before any traversal.

## Embedding Guidance

- Default production profile: OpenAI `text-embedding-3-small`, `1536` dimensions, stored and queried as `F32Array` (`param.array(param.f32())` / `Vec<f32>`).
- Embeddings are produced by the application and passed as numeric array parameters. Dynamic JSON/TS calls should assume client-side embeddings.
- Validate `embedding.length === 1536` before writing or searching when using the default model.
- Store `embeddingModel = "openai:text-embedding-3-small"` and `embeddingDim = 1536` in app configuration or an operational metadata node. Optionally duplicate those values on `Memory`/`Chunk` for audit/migration.
- Do not mix embeddings from different models or dimensions in one index. Changing models requires re-embedding records and rebuilding or replacing the index strategy.
- Embed the same text stored in `content` or a deterministic normalised version.
- Deterministic token-hash embeddings are acceptable for local smoke tests and UI demos only. Do not use them for production recall quality, MemoryBench-style evaluations, or threshold tuning.
- Similarity/dedup thresholds are model-specific. Retune thresholds after changing embedding model, dimension, normalisation, or chunk/memory text format.
- For stored Rust enterprise routes, a server-side embedding model may be configured with route-specific features when supported. Keep the default guidance as client-side embeddings unless the target repo already uses server-side embedding routes.

## Contextual Memory Extraction

Extraction is an application worker. It should not classify the current message in isolation. Pass the extractor a structured input containing:

- current user message
- previous assistant message
- bounded recent conversation window
- recalled active memories
- active entities and topics
- current date/time
- tenant and visibility scope (`tenant_id`, `userId`, `containerId`, `projectId`, or ACL context)

Required extractor behaviour:

- resolve pronouns and ellipsis before deciding whether a fact is durable
- treat short answers to assistant follow-up questions as memory candidates
- output self-contained memories with named entities where possible
- separate lifecycle timing from real-world event timing
- attach relationship intent: `new`, `duplicate`, `EXTENDS`, `UPDATES`, or `DERIVES`
- include source pointers (`sessionId`, `messageId`, `documentId`, `chunkId`) and confidence

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
Relationship: EXTENDS the existing Japan trip memory; IN_CATEGORY travel/preferences.

User later: actually we're going in May instead
Extract: User is planning a trip to Japan with Maya in May.
Relationship: UPDATES the previous next-April timing memory; set old isLatest=false and validTo.
```

Minimal extractor output shape:

```json
{
  "shouldStore": true,
  "content": "User wants their Japan trip with Maya to focus on food, temples, and trains.",
  "kind": "preference",
  "category": "travel",
  "salience": 0.72,
  "confidence": 0.86,
  "entities": ["Maya", "Japan"],
  "scope": { "tenant_id": "tenant_123", "userId": "user_456", "visibility": "user" },
  "source": { "sessionId": "sess_789", "messageId": "msg_012" },
  "temporal": { "temporalText": null, "eventStartAt": null, "eventEndAt": null, "timezone": "UTC" },
  "relationship": { "type": "EXTENDS", "targetMemoryId": "mem_trip_japan" }
}
```

## Deduplication & Relationship Adjudication

Do semantic dedup as read-then-write. A single vector threshold is not enough for accurate memory updates.

Recommended adjudication input:

- exact id/content match candidates for idempotency
- nearest vector candidates from current scoped memories
- BM25 candidates for names, ids, dates, and rare terms
- active entity/category neighbors for the candidate memory
- current user/container scope and source pointers

Relationship decisions:

| Decision | Use When | Write Behaviour |
|---|---|---|
| `duplicate` | Candidate says the same durable fact as an existing current memory. | Reinforce existing memory; do not add a new fact. |
| `UPDATES` | Candidate corrects, contradicts, or replaces an older fact. | Create new memory, link `new -UPDATES-> old`, set old `isLatest=false` and `validTo`. |
| `EXTENDS` | Candidate adds details without replacing the old fact. | Create new memory and link `new -EXTENDS-> existing`. |
| `DERIVES` | Candidate is inferred from multiple supporting memories. | Create inferred memory and link supporting facts with `DERIVES`. |
| `new` | No equivalent, replacement, or extension relationship applies. | Create standalone memory with provenance edges. |

Tune thresholds per embedding model, but make the final write decision with explicit relationship classification. Re-run the adjudicator when the embedding model, normalization, chunking, or memory text format changes.

## Evaluation Checklist

Memory quality needs product-level tests, not just query tests:

- tenant isolation: a query in tenant A never returns tenant B records
- user/container isolation: a user-scoped query never returns another user's private memories inside the same tenant
- stale suppression: superseded, deleted, expired, and `isLatest=false` memories do not enter context
- contextual extraction: short answers such as `next April` and `mostly food, temples, and trains` produce self-contained memories with the correct entities
- exact-token recall: rare names, ids, paths, commands, and dates are recovered through BM25
- semantic recall: paraphrases recover the right memories through vector search
- temporal corrections: updates such as `actually May instead` invalidate the old dated memory and preserve the new event timing
- deletion/forgetting: soft-deleted records disappear from recall and profile rebuilds
- profile rebuild: profile summaries update after writes, invalidations, and deletions
- latency and token budget: hybrid recall, reranking, graph expansion, and context packing stay within product limits

## Hybrid Fusion & Re-Ranking

Helix returns separate result sets. Fuse in application code.

**Reciprocal Rank Fusion (RRF):**

```text
rrf_score(item) = sum_over_lists(1 / (k + rank_in_list))  # k ~= 60, rank is 1-based
```

Use the union of memory/chunk IDs across vector and BM25 lists, sum each item's reciprocal rank, sort descending.

**Final re-rank:**

```text
final = w_rrf * rrf_score
      + w_sal * salience
      + w_rec * recency_decay(lastAccessedAt)
      + w_rel * relationship_boost
      + w_xenc * optional_cross_encoder_score
```

Typical starting weights: `w_rrf=1.0`, `w_sal=0.3`, `w_rec=0.2`, `w_rel=0.1`. Tune per app and benchmark. Apply stale/current filters before ranking output.

## Context Packing

Return only what the model/caller needs:

- `UserProfile.staticSummary` and `dynamicSummary` for broad personalization
- top current memories with `memoryId`, `content`, `kind`, `salience`, and source pointers
- source chunks with `chunkId`, `documentId`, `content`, `title`/`uri` if citations are needed
- relationship annotations when helpful (`updates`, `extends`, `derived_from`)

Never include embedding arrays in normal responses.

## TypeScript ↔ Rust API Mapping

| TypeScript (`@helixdb/enterprise-ql`) | Rust DSL | Notes |
|---|---|---|
| `readBatch()` / `writeBatch()` | `read_batch()` / `write_batch()` | |
| `g()` | `g()` | empty traversal source |
| `.varAs(name, t)` / `.varAsIf(name, cond, t)` | `.var_as(...)` / `.var_as_if(...)` | branch on `BatchCondition` |
| `BatchCondition.varEmpty/varNotEmpty(name)` | `BatchCondition::VarEmpty/VarNotEmpty(name)` | only tests emptiness/size, not value thresholds |
| `.nWithLabelWhere("Memory", SourcePredicate.eq("tenant_id", p.tenant_id))` | `.n_with_label_where(...)` / `g().n_with_label("Memory").where_(Predicate::eq_param(...))` | indexed anchor |
| `.where(Predicate.isNull("deletedAt"))` | `.where_(Predicate::is_null(...))` | post-source filter |
| `.vectorSearchNodesWith(label, prop, p.vec, p.k, p.tenant_id)` | `.vector_search_nodes_with(label, prop, PropertyInput::param("vec"), Expr::param("k"), Some(PropertyInput::param("tenant_id")))` | tenant arg last |
| `.textSearchNodesWith(label, prop, p.q, p.k, p.tenant_id)` | `.text_search_nodes_with(...)` | BM25 |
| `.addN("Memory", { ... })` | `.add_n("Memory", vec![("k", ...)])` | TS takes an object map |
| `.addE("OWNS", NodeRef.var("mem"), { tenant_id: p.tenant_id })` | `.add_e("OWNS", NodeRef::var("mem"), vec![("tenant_id", ...)])` | put tenant scope on edges |
| `.setProperty("lastAccessedAt", Expr.datetime())` | `.set_property("lastAccessedAt", Expr::datetime())` | typed DateTime |
| `Expr.prop("accessCount").add(Expr.val(1))` | `Expr::prop("accessCount").add(Expr::val(1))` | increment |
| `.drop()` / `.dropEdgeById(...)` | `.drop()` / `.drop_edge_by_id(...)` | `dropEdgeById` is surgical on multigraphs |
| `createIndexIfNotExists(IndexSpec.nodeVector(...))` | `create_index_if_not_exists(IndexSpec::node_vector(...))` | prefer explicit `IndexSpec` in examples |
| `param.string()/i64()/f64()/array(param.f32())/dateTime()` | `#[register] pub fn route(...) -> ReadBatch` | parameterisation + transport |
