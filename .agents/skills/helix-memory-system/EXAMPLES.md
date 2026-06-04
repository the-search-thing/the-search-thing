# Helix Memory System — TypeScript Examples

Complete `@helixdb/enterprise-ql` snippets for a tenant-safe memory lifecycle. The Rust equivalents are in `EXAMPLES.rust.md`. The model and indexes are in `REFERENCE.md`.

Each query function is plain; call it and `.toDynamicJson(params, values)` to get the body for `POST /v1/query`. Embeddings are produced by the application and passed as numeric arrays. Default to OpenAI `text-embedding-3-small` (`1536` dimensions, `F32`) unless the app has explicitly standardised on another model. Every tenant-owned node/edge carries `tenant_id`; every search passes `tenant_id` as the tenant value. The default examples also filter user-private memories and chunks by `userId`; replace that with `containerId`, `scopeId`, or app ACL filtering for project/team/workspace memory.

```ts
import {
  g, readBatch, writeBatch, defineParams, param,
  NodeRef, SourcePredicate, Predicate, Expr, CompareOp,
  IndexSpec, Projection, BatchCondition,
} from "@helixdb/enterprise-ql";
```

Shared predicates used by recall routes:

```ts
function currentMemoryPredicate(nowParam = "now") {
  return Predicate.and([
    Predicate.eq("isLatest", true),
    Predicate.isNull("deletedAt"),
    Predicate.isNull("validTo"),
    Predicate.or([
      Predicate.isNull("expiresAt"),
      Predicate.compare(Expr.prop("expiresAt"), CompareOp.Gt, Expr.param(nowParam)),
    ]),
  ]);
}

function liveChunkPredicate() {
  return Predicate.isNull("deletedAt");
}

function currentUserMemoryPredicate(nowParam = "now", userParam = "userId") {
  return Predicate.and([
    Predicate.eqParam("tenant_id", "tenant_id"),
    Predicate.eqParam("userId", userParam),
    currentMemoryPredicate(nowParam),
  ]);
}

function liveUserChunkPredicate(userParam = "userId") {
  return Predicate.and([
    Predicate.eqParam("tenant_id", "tenant_id"),
    Predicate.eqParam("userId", userParam),
    liveChunkPredicate(),
  ]);
}
```

Embedding constants used by the write examples:

```ts
const DEFAULT_EMBEDDING_MODEL = "openai:text-embedding-3-small";
const DEFAULT_EMBEDDING_DIM = 1536;
```

Extraction happens app-side before `createMemory(...)`. The extractor should receive the current user message, previous assistant message, recent conversation window, recalled active memories/entities, current date, and memory scope (`tenant_id` plus `userId` or the app's container/ACL context). It must resolve short follow-up answers into self-contained memories and return a relationship decision (`new`, `duplicate`, `EXTENDS`, `UPDATES`, or `DERIVES`) rather than relying on vector distance alone.

```text
Existing memory: User is planning a trip to Japan with Maya.
Assistant: When are you going?
User: next April
Extract: User is planning a trip to Japan with Maya next April.
Relationship: EXTENDS the existing Japan trip memory.
```

---

## 1. Bootstrap indexes (run once)

```ts
function bootstrapMemoryIndexes() {
  return writeBatch()
    .varAs("tenant",      g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("Tenant", "tenant_id")))
    .varAs("userKey",     g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("User", "userKey")))
    .varAs("userTenant",  g().createIndexIfNotExists(IndexSpec.nodeEquality("User", "tenant_id")))
    .varAs("userId",      g().createIndexIfNotExists(IndexSpec.nodeEquality("User", "userId")))
    .varAs("profileId",   g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("UserProfile", "profileId")))
    .varAs("profileTen",  g().createIndexIfNotExists(IndexSpec.nodeEquality("UserProfile", "tenant_id")))
    .varAs("profileUser", g().createIndexIfNotExists(IndexSpec.nodeEquality("UserProfile", "userId")))
    .varAs("docId",       g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("SourceDocument", "documentId")))
    .varAs("docTenant",   g().createIndexIfNotExists(IndexSpec.nodeEquality("SourceDocument", "tenant_id")))
    .varAs("docUser",     g().createIndexIfNotExists(IndexSpec.nodeEquality("SourceDocument", "userId")))
    .varAs("docChecksum", g().createIndexIfNotExists(IndexSpec.nodeEquality("SourceDocument", "checksum")))
    .varAs("chunkId",     g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("Chunk", "chunkId")))
    .varAs("chunkTenant", g().createIndexIfNotExists(IndexSpec.nodeEquality("Chunk", "tenant_id")))
    .varAs("chunkUser",   g().createIndexIfNotExists(IndexSpec.nodeEquality("Chunk", "userId")))
    .varAs("chunkDoc",    g().createIndexIfNotExists(IndexSpec.nodeEquality("Chunk", "documentId")))
    .varAs("chunkVec",    g().createIndexIfNotExists(IndexSpec.nodeVector("Chunk", "embedding", "tenant_id")))
    .varAs("chunkText",   g().createIndexIfNotExists(IndexSpec.nodeText("Chunk", "content", "tenant_id")))
    .varAs("memoryId",    g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("Memory", "memoryId")))
    .varAs("memTenant",   g().createIndexIfNotExists(IndexSpec.nodeEquality("Memory", "tenant_id")))
    .varAs("memUser",     g().createIndexIfNotExists(IndexSpec.nodeEquality("Memory", "userId")))
    .varAs("memLatest",   g().createIndexIfNotExists(IndexSpec.nodeEquality("Memory", "isLatest")))
    .varAs("memVector",   g().createIndexIfNotExists(IndexSpec.nodeVector("Memory", "embedding", "tenant_id")))
    .varAs("memText",     g().createIndexIfNotExists(IndexSpec.nodeText("Memory", "content", "tenant_id")))
    .varAs("catKey",      g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("Category", "categoryKey")))
    .varAs("catTenant",   g().createIndexIfNotExists(IndexSpec.nodeEquality("Category", "tenant_id")))
    .varAs("entKey",      g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("Entity", "entityKey")))
    .varAs("entTenant",   g().createIndexIfNotExists(IndexSpec.nodeEquality("Entity", "tenant_id")))
    .varAs("sessId",      g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("Session", "sessionId")))
    .varAs("sessTenant",  g().createIndexIfNotExists(IndexSpec.nodeEquality("Session", "tenant_id")))
    .varAs("sessUser",    g().createIndexIfNotExists(IndexSpec.nodeEquality("Session", "userId")))
    .returning(["memVector", "memText", "chunkVec", "chunkText"]);
}
```

---

## 2. Source document + chunk ingestion

Extraction, chunking, and embedding happen app-side. This query stores one user-scoped chunk and links it to its source document. `embedding` should be a 1536-length `F32` vector from `text-embedding-3-small` when using the default profile. For intentionally tenant-wide shared documents, replace `userId` filtering with explicit `visibility`/ACL policy.

```ts
const ingestChunkParams = defineParams({
  tenant_id: param.string(),
  userId: param.string(),
  documentId: param.string(),
  chunkId: param.string(),
  sourceType: param.string(),
  title: param.string(),
  uri: param.string(),
  checksum: param.string(),
  content: param.string(),
  embedding: param.array(param.f32()),
  ordinal: param.i64(),
});

function ingestChunk(p = ingestChunkParams) {
  return writeBatch()
    .varAs("doc", g().nWithLabelWhere("SourceDocument", SourcePredicate.eq("documentId", p.documentId)).where(Predicate.and([Predicate.eqParam("tenant_id", "tenant_id"), Predicate.eqParam("userId", "userId")])))
    .varAsIf(
      "docNew",
      BatchCondition.varEmpty("doc"),
      g().addN("SourceDocument", {
        documentId: p.documentId,
        tenant_id: p.tenant_id,
        userId: p.userId,
        visibility: "user",
        sourceType: p.sourceType,
        title: p.title,
        uri: p.uri,
        checksum: p.checksum,
        status: "indexed",
        createdAt: Expr.datetime(),
        updatedAt: Expr.datetime(),
      }),
    )
    .varAs(
      "chunk",
      g().addN("Chunk", {
        chunkId: p.chunkId,
        tenant_id: p.tenant_id,
        userId: p.userId,
        visibility: "user",
        documentId: p.documentId,
        content: p.content,
        embedding: p.embedding,
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
        embeddingDim: DEFAULT_EMBEDDING_DIM,
        ordinal: p.ordinal,
        createdAt: Expr.datetime(),
        updatedAt: Expr.datetime(),
      }),
    )
    .varAsIf("linkDoc",    BatchCondition.varNotEmpty("doc"),    g().n(NodeRef.var("doc")).addE("HAS_CHUNK", NodeRef.var("chunk"), { tenant_id: p.tenant_id, ordinal: p.ordinal }))
    .varAsIf("linkDocNew", BatchCondition.varNotEmpty("docNew"), g().n(NodeRef.var("docNew")).addE("HAS_CHUNK", NodeRef.var("chunk"), { tenant_id: p.tenant_id, ordinal: p.ordinal }))
    .returning(["chunk"]);
}
```

---

## 3. Generation — read-then-write semantic dedup

A similarity threshold cannot be a batch condition. Read the nearest current memory for the tenant and user scope, then the app decides whether to reinforce or create. `embedding` should be the 1536-length `F32` query vector from the same embedding model used at write time.

```ts
const nearestParams = defineParams({
  tenant_id: param.string(),
  userId: param.string(),
  embedding: param.array(param.f32()),
  now: param.dateTime(),
});

function nearestCurrentMemory(p = nearestParams) {
  return readBatch()
    .varAs(
      "nearest",
      g()
        .vectorSearchNodesWith("Memory", "embedding", p.embedding, 1, p.tenant_id)
        .where(currentUserMemoryPredicate("now", "userId"))
        .project([
          Projection.property("memoryId", "memoryId"),
          Projection.property("content", "content"),
          Projection.property("$distance", "distance"),
        ]),
    )
    .returning(["nearest"]);
}
```

---

## 4. Create memory with tenant-scoped user/session upserts

Use this after contextual extraction and semantic dedup decide the candidate is new. `embedding` must be computed from the final self-contained `content`, not from the raw short user utterance.

```ts
const createMemoryParams = defineParams({
  tenant_id: param.string(),
  userId: param.string(),
  userKey: param.string(),
  sessionId: param.string(),
  memoryId: param.string(),
  content: param.string(),
  embedding: param.array(param.f32()),
  kind: param.string(),
  salience: param.f64(),
  confidence: param.f64(),
  isStatic: param.bool(),
});

function createMemory(p = createMemoryParams) {
  return writeBatch()
    .varAs("user", g().nWithLabelWhere("User", SourcePredicate.eq("userKey", p.userKey)).where(Predicate.eqParam("tenant_id", "tenant_id")))
    .varAsIf(
      "userNew",
      BatchCondition.varEmpty("user"),
      g().addN("User", {
        userKey: p.userKey,
        tenant_id: p.tenant_id,
        userId: p.userId,
        createdAt: Expr.datetime(),
      }),
    )
    .varAs("session", g().nWithLabelWhere("Session", SourcePredicate.eq("sessionId", p.sessionId)).where(Predicate.and([Predicate.eqParam("tenant_id", "tenant_id"), Predicate.eqParam("userId", "userId")])))
    .varAsIf(
      "sessionNew",
      BatchCondition.varEmpty("session"),
      g().addN("Session", {
        sessionId: p.sessionId,
        tenant_id: p.tenant_id,
        userId: p.userId,
        startedAt: Expr.datetime(),
      }),
    )
    .varAs(
      "mem",
      g().addN("Memory", {
        memoryId: p.memoryId,
        tenant_id: p.tenant_id,
        userId: p.userId,
        content: p.content,
        embedding: p.embedding,
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
        embeddingDim: DEFAULT_EMBEDDING_DIM,
        kind: p.kind,
        salience: p.salience,
        confidence: p.confidence,
        isLatest: true,
        isStatic: p.isStatic,
        visibility: "user",
        inferred: false,
        accessCount: 0,
        validFrom: Expr.datetime(),
        createdAt: Expr.datetime(),
        updatedAt: Expr.datetime(),
        lastAccessedAt: Expr.datetime(),
        sourceSessionId: p.sessionId,
      }),
    )
    .varAsIf("own",       BatchCondition.varNotEmpty("user"),       g().n(NodeRef.var("user")).addE("OWNS", NodeRef.var("mem"), { tenant_id: p.tenant_id, createdAt: Expr.datetime() }))
    .varAsIf("ownNew",    BatchCondition.varNotEmpty("userNew"),    g().n(NodeRef.var("userNew")).addE("OWNS", NodeRef.var("mem"), { tenant_id: p.tenant_id, createdAt: Expr.datetime() }))
    .varAsIf("fromSess",  BatchCondition.varNotEmpty("session"),    g().n(NodeRef.var("mem")).addE("DERIVED_FROM", NodeRef.var("session"), { tenant_id: p.tenant_id }))
    .varAsIf("fromSessN", BatchCondition.varNotEmpty("sessionNew"), g().n(NodeRef.var("mem")).addE("DERIVED_FROM", NodeRef.var("sessionNew"), { tenant_id: p.tenant_id }))
    .returning(["mem"]);
}
```

---

## 5. Categorisation and entity linking

Pass tenant-qualified keys from the app, e.g. `categoryKey = tenant_id + ":" + normalisedName`.

```ts
const categoriseParams = defineParams({
  tenant_id: param.string(),
  userId: param.string(),
  memoryId: param.string(),
  categoryKey: param.string(),
  categoryName: param.string(),
  entityKey: param.string(),
  entityName: param.string(),
  entityType: param.string(),
  confidence: param.f64(),
});

function categoriseMemory(p = categoriseParams) {
  return writeBatch()
    .varAs("mem", g().nWithLabelWhere("Memory", SourcePredicate.eq("memoryId", p.memoryId)).where(Predicate.and([Predicate.eqParam("tenant_id", "tenant_id"), Predicate.eqParam("userId", "userId")])))
    .varAs("cat", g().nWithLabelWhere("Category", SourcePredicate.eq("categoryKey", p.categoryKey)).where(Predicate.eqParam("tenant_id", "tenant_id")))
    .varAsIf("catNew", BatchCondition.varEmpty("cat"), g().addN("Category", { categoryKey: p.categoryKey, tenant_id: p.tenant_id, name: p.categoryName }))
    .varAsIf("linkCat",    BatchCondition.varNotEmpty("cat"),    g().n(NodeRef.var("mem")).addE("IN_CATEGORY", NodeRef.var("cat"), { tenant_id: p.tenant_id, confidence: p.confidence }))
    .varAsIf("linkCatNew", BatchCondition.varNotEmpty("catNew"), g().n(NodeRef.var("mem")).addE("IN_CATEGORY", NodeRef.var("catNew"), { tenant_id: p.tenant_id, confidence: p.confidence }))
    .varAs("ent", g().nWithLabelWhere("Entity", SourcePredicate.eq("entityKey", p.entityKey)).where(Predicate.eqParam("tenant_id", "tenant_id")))
    .varAsIf("entNew", BatchCondition.varEmpty("ent"), g().addN("Entity", { entityKey: p.entityKey, tenant_id: p.tenant_id, name: p.entityName, entityType: p.entityType }))
    .varAsIf("mentions",    BatchCondition.varNotEmpty("ent"),    g().n(NodeRef.var("mem")).addE("MENTIONS", NodeRef.var("ent"), { tenant_id: p.tenant_id }))
    .varAsIf("mentionsNew", BatchCondition.varNotEmpty("entNew"), g().n(NodeRef.var("mem")).addE("MENTIONS", NodeRef.var("entNew"), { tenant_id: p.tenant_id }))
    .returning(["mem"]);
}
```

---

## 6. Updating — reinforce on access

```ts
const reinforceParams = defineParams({
  tenant_id: param.string(),
  userId: param.string(),
  memoryId: param.string(),
  now: param.dateTime(),
});

function reinforceMemory(p = reinforceParams) {
  const raised = Expr.prop("salience").add(Expr.val(0.1));

  return writeBatch()
    .varAs(
      "mem",
      g()
        .nWithLabelWhere("Memory", SourcePredicate.eq("memoryId", p.memoryId))
        .where(currentUserMemoryPredicate("now", "userId"))
        .setProperty("lastAccessedAt", Expr.datetime())
        .setProperty("accessCount", Expr.prop("accessCount").add(Expr.val(1)))
        .setProperty("salience", Expr.case([[Predicate.compare(raised, CompareOp.Gt, Expr.val(1.0)), Expr.val(1.0)]], raised)),
    )
    .returning(["mem"]);
}
```

---

## 7. Correct/update — new memory supersedes old

The app creates the new memory first, then links it to the old one and invalidates the old version.

```ts
const updateParams = defineParams({
  tenant_id: param.string(),
  userId: param.string(),
  newId: param.string(),
  oldId: param.string(),
  reason: param.string(),
});

function markMemoryUpdated(p = updateParams) {
  return writeBatch()
    .varAs("old", g().nWithLabelWhere("Memory", SourcePredicate.eq("memoryId", p.oldId)).where(Predicate.and([Predicate.eqParam("tenant_id", "tenant_id"), Predicate.eqParam("userId", "userId")])))
    .varAs("new", g().nWithLabelWhere("Memory", SourcePredicate.eq("memoryId", p.newId)).where(Predicate.and([Predicate.eqParam("tenant_id", "tenant_id"), Predicate.eqParam("userId", "userId")])))
    .varAs("link", g().n(NodeRef.var("new")).addE("UPDATES", NodeRef.var("old"), { tenant_id: p.tenant_id, reason: p.reason, at: Expr.datetime() }))
    .varAs(
      "invalidate",
      g()
        .n(NodeRef.var("old"))
        .setProperty("isLatest", false)
        .setProperty("validTo", Expr.datetime()),
    )
    .returning(["link", "invalidate"]);
}
```

---

## 8. Forgetting sweeps

Soft-delete is preferred; reads filter it out.

```ts
const softDeleteParams = defineParams({ tenant_id: param.string(), userId: param.string(), memoryId: param.string() });

function softDeleteMemory(p = softDeleteParams) {
  return writeBatch()
    .varAs(
      "mem",
      g()
        .nWithLabelWhere("Memory", SourcePredicate.eq("memoryId", p.memoryId))
        .where(Predicate.and([Predicate.eqParam("tenant_id", "tenant_id"), Predicate.eqParam("userId", "userId")]))
        .setProperty("deletedAt", Expr.datetime()),
    )
    .returning(["mem"]);
}
```

```ts
const decayParams = defineParams({
  tenant_id: param.string(),
  cutoff: param.dateTime(),
  minSalience: param.f64(),
  minAccess: param.i64(),
});

function decaySweep(p = decayParams) {
  return writeBatch()
    .varAs(
      "decayed",
      g()
        .nWithLabelWhere("Memory", SourcePredicate.eq("tenant_id", p.tenant_id))
        .where(Predicate.and([
          Predicate.isNull("deletedAt"),
          Predicate.eq("isLatest", true),
          Predicate.compare(Expr.prop("lastAccessedAt"), CompareOp.Lt, Expr.param("cutoff")),
          Predicate.compare(Expr.prop("salience"), CompareOp.Lt, Expr.param("minSalience")),
          Predicate.compare(Expr.prop("accessCount"), CompareOp.Lt, Expr.param("minAccess")),
        ]))
        .setProperty("deletedAt", Expr.datetime()),
    )
    .returning(["decayed"]);
}
```

```ts
const expiryParams = defineParams({ tenant_id: param.string(), now: param.dateTime() });

function expirySweep(p = expiryParams) {
  return writeBatch()
    .varAs(
      "expired",
      g()
        .nWithLabelWhere("Memory", SourcePredicate.eq("tenant_id", p.tenant_id))
        .where(Predicate.and([
          Predicate.isNull("deletedAt"),
          Predicate.isNotNull("expiresAt"),
          Predicate.compare(Expr.prop("expiresAt"), CompareOp.Lt, Expr.param("now")),
        ]))
        .setProperty("deletedAt", Expr.datetime()),
    )
    .returning(["expired"]);
}
```

---

## 9. Hybrid retrieval — profile + memories + source chunks

Run multiple recall paths in one read batch, then fuse and rerank app-side.

```ts
const recallParams = defineParams({
  tenant_id: param.string(),
  userId: param.string(),
  embedding: param.array(param.f32()),
  query: param.string(),
  k: param.i64(),
  now: param.dateTime(),
});

function hybridRecall(p = recallParams) {
  return readBatch()
    .varAs(
      "profile",
      g()
        .nWithLabelWhere("UserProfile", SourcePredicate.eq("tenant_id", p.tenant_id))
        .where(Predicate.eqParam("userId", "userId"))
        .project([
          Projection.property("staticSummary", "staticSummary"),
          Projection.property("dynamicSummary", "dynamicSummary"),
        ]),
    )
    .varAs(
      "memorySemantic",
      g()
        .vectorSearchNodesWith("Memory", "embedding", p.embedding, p.k, p.tenant_id)
        .where(currentUserMemoryPredicate("now", "userId"))
        .project([
          Projection.property("memoryId", "id"),
          Projection.property("content", "content"),
          Projection.property("kind", "kind"),
          Projection.property("salience", "salience"),
          Projection.property("lastAccessedAt", "lastAccessedAt"),
          Projection.property("documentId", "documentId"),
          Projection.property("chunkId", "chunkId"),
          Projection.property("$distance", "distance"),
        ]),
    )
    .varAs(
      "memoryKeyword",
      g()
        .textSearchNodesWith("Memory", "content", p.query, p.k, p.tenant_id)
        .where(currentUserMemoryPredicate("now", "userId"))
        .project([
          Projection.property("memoryId", "id"),
          Projection.property("content", "content"),
          Projection.property("kind", "kind"),
          Projection.property("salience", "salience"),
          Projection.property("lastAccessedAt", "lastAccessedAt"),
          Projection.property("documentId", "documentId"),
          Projection.property("chunkId", "chunkId"),
          Projection.property("$distance", "score"),
        ]),
    )
    .varAs(
      "chunkSemantic",
      g()
        .vectorSearchNodesWith("Chunk", "embedding", p.embedding, p.k, p.tenant_id)
        .where(liveUserChunkPredicate("userId"))
        .project([
          Projection.property("chunkId", "id"),
          Projection.property("documentId", "documentId"),
          Projection.property("content", "content"),
          Projection.property("ordinal", "ordinal"),
          Projection.property("$distance", "distance"),
        ]),
    )
    .varAs(
      "chunkKeyword",
      g()
        .textSearchNodesWith("Chunk", "content", p.query, p.k, p.tenant_id)
        .where(liveUserChunkPredicate("userId"))
        .project([
          Projection.property("chunkId", "id"),
          Projection.property("documentId", "documentId"),
          Projection.property("content", "content"),
          Projection.property("ordinal", "ordinal"),
          Projection.property("$distance", "score"),
        ]),
    )
    .returning(["profile", "memorySemantic", "memoryKeyword", "chunkSemantic", "chunkKeyword"]);
}
```

App-side fusion:

```ts
type Hit = { id: string; content: string; salience?: number; lastAccessedAt?: number };

function fuse(lists: Hit[][], k = 60): Hit[] {
  const score = new Map<string, { hit: Hit; s: number }>();

  for (const list of lists) {
    list.forEach((hit, i) => {
      const cur = score.get(hit.id) ?? { hit, s: 0 };
      cur.s += 1 / (k + i + 1);
      score.set(hit.id, cur);
    });
  }

  const now = Date.now();
  const halflifeMs = 30 * 24 * 3600 * 1000;

  return [...score.values()]
    .map(({ hit, s }) => {
      const salience = hit.salience ?? 0;
      const last = hit.lastAccessedAt ?? now;
      const recency = Math.exp((-Math.LN2 * (now - last)) / halflifeMs);
      return { hit, final: 1.0 * s + 0.3 * salience + 0.2 * recency };
    })
    .sort((a, b) => b.final - a.final)
    .map((x) => x.hit);
}
```

---

## 10. Bounded graph expansion

Pull memories that mention the same entities. The seed can come from the fused top-k list.

```ts
const expandParams = defineParams({
  tenant_id: param.string(),
  userId: param.string(),
  memoryId: param.string(),
  now: param.dateTime(),
});

function expandViaEntities(p = expandParams) {
  return readBatch()
    .varAs(
      "related",
      g()
        .nWithLabelWhere("Memory", SourcePredicate.eq("memoryId", p.memoryId))
        .where(Predicate.and([Predicate.eqParam("tenant_id", "tenant_id"), Predicate.eqParam("userId", "userId")]))
        .out("MENTIONS")
        .in("MENTIONS")
        .dedup()
        .where(currentUserMemoryPredicate("now", "userId"))
        .limit(10)
        .project([
          Projection.property("memoryId", "memoryId"),
          Projection.property("content", "content"),
          Projection.property("kind", "kind"),
        ]),
    )
    .returning(["related"]);
}
```

The expansion can return the seed memory itself. Filter it out app-side by `memoryId`, or add an inequality predicate if the local DSL route already supports the exact parameterized comparison shape you prefer.
