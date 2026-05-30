# Helix Memory System — Rust Examples

The same lifecycle patterns as `EXAMPLES.md`, in the Rust DSL. Use this when the app/runtime is Rust or the team ships Rust stored routes. TypeScript is the default for Node/TS services.

Each query is a `#[register]` function. Parameters are bound by name, and calling the generated route yields a request that can be sent to Helix. Data model and indexes are in `REFERENCE.md`. Default to OpenAI `text-embedding-3-small` (`1536` dimensions, `F32`) unless the app has explicitly standardised on another model. The examples also filter user-private memories and chunks by `userId`; replace that with `containerId`, `scopeId`, or app ACL filtering for project/team/workspace memory.

```rust
use helix_db::dsl::prelude::*;
```

Embedding constants used by the write examples:

```rust
const DEFAULT_EMBEDDING_MODEL: &str = "openai:text-embedding-3-small";
const DEFAULT_EMBEDDING_DIM: i64 = 1536;
```

Extraction happens app-side before `create_memory(...)`. The extractor should receive the current user message, previous assistant message, recent conversation window, recalled active memories/entities, current date, and memory scope (`tenant_id` plus `userId` or the app's container/ACL context). It must resolve short follow-up answers into self-contained memories and return a relationship decision (`new`, `duplicate`, `EXTENDS`, `UPDATES`, or `DERIVES`) before embedding and writing.

Shared predicates used by recall routes:

```rust
fn current_memory_predicate(now_param: &str) -> Predicate {
    Predicate::and(vec![
        Predicate::eq("isLatest", true),
        Predicate::is_null("deletedAt"),
        Predicate::is_null("validTo"),
        Predicate::or(vec![
            Predicate::is_null("expiresAt"),
            Predicate::compare(Expr::prop("expiresAt"), CompareOp::Gt, Expr::param(now_param)),
        ]),
    ])
}

fn live_chunk_predicate() -> Predicate {
    Predicate::is_null("deletedAt")
}

fn current_user_memory_predicate(now_param: &str, user_param: &str) -> Predicate {
    Predicate::and(vec![
        Predicate::eq_param("tenant_id", "tenant_id"),
        Predicate::eq_param("userId", user_param),
        current_memory_predicate(now_param),
    ])
}

fn live_user_chunk_predicate(user_param: &str) -> Predicate {
    Predicate::and(vec![
        Predicate::eq_param("tenant_id", "tenant_id"),
        Predicate::eq_param("userId", user_param),
        live_chunk_predicate(),
    ])
}
```

---

## 1. Bootstrap indexes (run once)

```rust
#[register]
pub fn bootstrap_memory_indexes() -> WriteBatch {
    write_batch()
        .var_as("tenant",      g().create_index_if_not_exists(IndexSpec::node_unique_equality("Tenant", "tenant_id")))
        .var_as("userKey",     g().create_index_if_not_exists(IndexSpec::node_unique_equality("User", "userKey")))
        .var_as("userTenant",  g().create_index_if_not_exists(IndexSpec::node_equality("User", "tenant_id")))
        .var_as("userId",      g().create_index_if_not_exists(IndexSpec::node_equality("User", "userId")))
        .var_as("profileId",   g().create_index_if_not_exists(IndexSpec::node_unique_equality("UserProfile", "profileId")))
        .var_as("profileTen",  g().create_index_if_not_exists(IndexSpec::node_equality("UserProfile", "tenant_id")))
        .var_as("profileUser", g().create_index_if_not_exists(IndexSpec::node_equality("UserProfile", "userId")))
        .var_as("docId",       g().create_index_if_not_exists(IndexSpec::node_unique_equality("SourceDocument", "documentId")))
        .var_as("docTenant",   g().create_index_if_not_exists(IndexSpec::node_equality("SourceDocument", "tenant_id")))
        .var_as("docUser",     g().create_index_if_not_exists(IndexSpec::node_equality("SourceDocument", "userId")))
        .var_as("docChecksum", g().create_index_if_not_exists(IndexSpec::node_equality("SourceDocument", "checksum")))
        .var_as("chunkId",     g().create_index_if_not_exists(IndexSpec::node_unique_equality("Chunk", "chunkId")))
        .var_as("chunkTenant", g().create_index_if_not_exists(IndexSpec::node_equality("Chunk", "tenant_id")))
        .var_as("chunkUser",   g().create_index_if_not_exists(IndexSpec::node_equality("Chunk", "userId")))
        .var_as("chunkDoc",    g().create_index_if_not_exists(IndexSpec::node_equality("Chunk", "documentId")))
        .var_as("chunkVec",    g().create_index_if_not_exists(IndexSpec::node_vector("Chunk", "embedding", Some("tenant_id"))))
        .var_as("chunkText",   g().create_index_if_not_exists(IndexSpec::node_text("Chunk", "content", Some("tenant_id"))))
        .var_as("memoryId",    g().create_index_if_not_exists(IndexSpec::node_unique_equality("Memory", "memoryId")))
        .var_as("memTenant",   g().create_index_if_not_exists(IndexSpec::node_equality("Memory", "tenant_id")))
        .var_as("memUser",     g().create_index_if_not_exists(IndexSpec::node_equality("Memory", "userId")))
        .var_as("memLatest",   g().create_index_if_not_exists(IndexSpec::node_equality("Memory", "isLatest")))
        .var_as("memVector",   g().create_index_if_not_exists(IndexSpec::node_vector("Memory", "embedding", Some("tenant_id"))))
        .var_as("memText",     g().create_index_if_not_exists(IndexSpec::node_text("Memory", "content", Some("tenant_id"))))
        .var_as("catKey",      g().create_index_if_not_exists(IndexSpec::node_unique_equality("Category", "categoryKey")))
        .var_as("catTenant",   g().create_index_if_not_exists(IndexSpec::node_equality("Category", "tenant_id")))
        .var_as("entKey",      g().create_index_if_not_exists(IndexSpec::node_unique_equality("Entity", "entityKey")))
        .var_as("entTenant",   g().create_index_if_not_exists(IndexSpec::node_equality("Entity", "tenant_id")))
        .var_as("sessId",      g().create_index_if_not_exists(IndexSpec::node_unique_equality("Session", "sessionId")))
        .var_as("sessTenant",  g().create_index_if_not_exists(IndexSpec::node_equality("Session", "tenant_id")))
        .var_as("sessUser",    g().create_index_if_not_exists(IndexSpec::node_equality("Session", "userId")))
        .returning(["memVector", "memText", "chunkVec", "chunkText"])
}
```

---

## 2. Source document + chunk ingestion

```rust
#[register]
pub fn ingest_chunk(
    tenant_id: String,
    userId: String,
    documentId: String,
    chunkId: String,
    sourceType: String,
    title: String,
    uri: String,
    checksum: String,
    content: String,
    embedding: Vec<f32>,
    ordinal: i64,
) -> WriteBatch {
    let _ = (&tenant_id, &userId, &documentId, &chunkId, &sourceType, &title, &uri, &checksum, &content, &embedding, &ordinal);

    write_batch()
        .var_as(
            "doc",
            g().n_with_label_where("SourceDocument", SourcePredicate::eq("documentId", Expr::param("documentId")))
                .where_(Predicate::and(vec![Predicate::eq_param("tenant_id", "tenant_id"), Predicate::eq_param("userId", "userId")])),
        )
        .var_as_if(
            "docNew",
            BatchCondition::VarEmpty("doc".to_string()),
            g().add_n(
                "SourceDocument",
                vec![
                    ("documentId", PropertyInput::param("documentId")),
                    ("tenant_id", PropertyInput::param("tenant_id")),
                    ("userId", PropertyInput::param("userId")),
                    ("visibility", PropertyInput::from("user")),
                    ("sourceType", PropertyInput::param("sourceType")),
                    ("title", PropertyInput::param("title")),
                    ("uri", PropertyInput::param("uri")),
                    ("checksum", PropertyInput::param("checksum")),
                    ("status", PropertyInput::from("indexed")),
                    ("createdAt", PropertyInput::from(Expr::datetime())),
                    ("updatedAt", PropertyInput::from(Expr::datetime())),
                ],
            ),
        )
        .var_as(
            "chunk",
            g().add_n(
                "Chunk",
                vec![
                    ("chunkId", PropertyInput::param("chunkId")),
                    ("tenant_id", PropertyInput::param("tenant_id")),
                    ("userId", PropertyInput::param("userId")),
                    ("visibility", PropertyInput::from("user")),
                    ("documentId", PropertyInput::param("documentId")),
                    ("content", PropertyInput::param("content")),
                    ("embedding", PropertyInput::param("embedding")),
                    ("embeddingModel", PropertyInput::from(DEFAULT_EMBEDDING_MODEL)),
                    ("embeddingDim", PropertyInput::from(DEFAULT_EMBEDDING_DIM)),
                    ("ordinal", PropertyInput::param("ordinal")),
                    ("createdAt", PropertyInput::from(Expr::datetime())),
                    ("updatedAt", PropertyInput::from(Expr::datetime())),
                ],
            ),
        )
        .var_as_if(
            "linkDoc",
            BatchCondition::VarNotEmpty("doc".to_string()),
            g().n(NodeRef::var("doc")).add_e(
                "HAS_CHUNK",
                NodeRef::var("chunk"),
                vec![("tenant_id", PropertyInput::param("tenant_id")), ("ordinal", PropertyInput::param("ordinal"))],
            ),
        )
        .var_as_if(
            "linkDocNew",
            BatchCondition::VarNotEmpty("docNew".to_string()),
            g().n(NodeRef::var("docNew")).add_e(
                "HAS_CHUNK",
                NodeRef::var("chunk"),
                vec![("tenant_id", PropertyInput::param("tenant_id")), ("ordinal", PropertyInput::param("ordinal"))],
            ),
        )
        .returning(["chunk"])
}
```

---

## 3. Generation — read-then-write semantic dedup

```rust
#[register]
pub fn nearest_current_memory(tenant_id: String, userId: String, embedding: Vec<f32>, now: DateTime) -> ReadBatch {
    let _ = (&tenant_id, &userId, &embedding, &now);

    read_batch()
        .var_as(
            "nearest",
            g().vector_search_nodes_with(
                "Memory",
                "embedding",
                PropertyInput::param("embedding"),
                1usize,
                Some(PropertyInput::param("tenant_id")),
            )
            .where_(current_user_memory_predicate("now", "userId"))
            .project(vec![
                PropertyProjection::new("memoryId"),
                PropertyProjection::new("content"),
                PropertyProjection::renamed("$distance", "distance"),
            ]),
        )
        .returning(["nearest"])
}
```

---

## 4. Create memory with tenant-scoped user/session upserts

```rust
#[register]
pub fn create_memory(
    tenant_id: String,
    userId: String,
    userKey: String,
    sessionId: String,
    memoryId: String,
    content: String,
    embedding: Vec<f32>,
    kind: String,
    salience: f64,
    confidence: f64,
    isStatic: bool,
) -> WriteBatch {
    let _ = (&tenant_id, &userId, &userKey, &sessionId, &memoryId, &content, &embedding, &kind, &salience, &confidence, &isStatic);

    write_batch()
        .var_as(
            "user",
            g().n_with_label_where("User", SourcePredicate::eq("userKey", Expr::param("userKey")))
                .where_(Predicate::eq_param("tenant_id", "tenant_id")),
        )
        .var_as_if(
            "userNew",
            BatchCondition::VarEmpty("user".to_string()),
            g().add_n(
                "User",
                vec![
                    ("userKey", PropertyInput::param("userKey")),
                    ("tenant_id", PropertyInput::param("tenant_id")),
                    ("userId", PropertyInput::param("userId")),
                    ("createdAt", PropertyInput::from(Expr::datetime())),
                ],
            ),
        )
        .var_as(
            "session",
            g().n_with_label_where("Session", SourcePredicate::eq("sessionId", Expr::param("sessionId")))
                .where_(Predicate::and(vec![Predicate::eq_param("tenant_id", "tenant_id"), Predicate::eq_param("userId", "userId")])),
        )
        .var_as_if(
            "sessionNew",
            BatchCondition::VarEmpty("session".to_string()),
            g().add_n(
                "Session",
                vec![
                    ("sessionId", PropertyInput::param("sessionId")),
                    ("tenant_id", PropertyInput::param("tenant_id")),
                    ("userId", PropertyInput::param("userId")),
                    ("startedAt", PropertyInput::from(Expr::datetime())),
                ],
            ),
        )
        .var_as(
            "mem",
            g().add_n(
                "Memory",
                vec![
                    ("memoryId", PropertyInput::param("memoryId")),
                    ("tenant_id", PropertyInput::param("tenant_id")),
                    ("userId", PropertyInput::param("userId")),
                    ("content", PropertyInput::param("content")),
                    ("embedding", PropertyInput::param("embedding")),
                    ("embeddingModel", PropertyInput::from(DEFAULT_EMBEDDING_MODEL)),
                    ("embeddingDim", PropertyInput::from(DEFAULT_EMBEDDING_DIM)),
                    ("kind", PropertyInput::param("kind")),
                    ("salience", PropertyInput::param("salience")),
                    ("confidence", PropertyInput::param("confidence")),
                    ("isLatest", PropertyInput::from(true)),
                    ("isStatic", PropertyInput::param("isStatic")),
                    ("visibility", PropertyInput::from("user")),
                    ("inferred", PropertyInput::from(false)),
                    ("accessCount", PropertyInput::from(0i64)),
                    ("validFrom", PropertyInput::from(Expr::datetime())),
                    ("createdAt", PropertyInput::from(Expr::datetime())),
                    ("updatedAt", PropertyInput::from(Expr::datetime())),
                    ("lastAccessedAt", PropertyInput::from(Expr::datetime())),
                    ("sourceSessionId", PropertyInput::param("sessionId")),
                ],
            ),
        )
        .var_as_if(
            "own",
            BatchCondition::VarNotEmpty("user".to_string()),
            g().n(NodeRef::var("user")).add_e(
                "OWNS",
                NodeRef::var("mem"),
                vec![("tenant_id", PropertyInput::param("tenant_id")), ("createdAt", PropertyInput::from(Expr::datetime()))],
            ),
        )
        .var_as_if(
            "ownNew",
            BatchCondition::VarNotEmpty("userNew".to_string()),
            g().n(NodeRef::var("userNew")).add_e(
                "OWNS",
                NodeRef::var("mem"),
                vec![("tenant_id", PropertyInput::param("tenant_id")), ("createdAt", PropertyInput::from(Expr::datetime()))],
            ),
        )
        .var_as_if(
            "fromSess",
            BatchCondition::VarNotEmpty("session".to_string()),
            g().n(NodeRef::var("mem")).add_e("DERIVED_FROM", NodeRef::var("session"), vec![("tenant_id", PropertyInput::param("tenant_id"))]),
        )
        .var_as_if(
            "fromSessN",
            BatchCondition::VarNotEmpty("sessionNew".to_string()),
            g().n(NodeRef::var("mem")).add_e("DERIVED_FROM", NodeRef::var("sessionNew"), vec![("tenant_id", PropertyInput::param("tenant_id"))]),
        )
        .returning(["mem"])
}
```

---

## 5. Categorisation and entity linking

```rust
#[register]
pub fn categorise_memory(
    tenant_id: String,
    userId: String,
    memoryId: String,
    categoryKey: String,
    categoryName: String,
    entityKey: String,
    entityName: String,
    entityType: String,
    confidence: f64,
) -> WriteBatch {
    let _ = (&tenant_id, &userId, &memoryId, &categoryKey, &categoryName, &entityKey, &entityName, &entityType, &confidence);

    write_batch()
        .var_as(
            "mem",
            g().n_with_label_where("Memory", SourcePredicate::eq("memoryId", Expr::param("memoryId")))
                .where_(Predicate::and(vec![Predicate::eq_param("tenant_id", "tenant_id"), Predicate::eq_param("userId", "userId")])),
        )
        .var_as(
            "cat",
            g().n_with_label_where("Category", SourcePredicate::eq("categoryKey", Expr::param("categoryKey")))
                .where_(Predicate::eq_param("tenant_id", "tenant_id")),
        )
        .var_as_if(
            "catNew",
            BatchCondition::VarEmpty("cat".to_string()),
            g().add_n(
                "Category",
                vec![
                    ("categoryKey", PropertyInput::param("categoryKey")),
                    ("tenant_id", PropertyInput::param("tenant_id")),
                    ("name", PropertyInput::param("categoryName")),
                ],
            ),
        )
        .var_as_if(
            "linkCat",
            BatchCondition::VarNotEmpty("cat".to_string()),
            g().n(NodeRef::var("mem")).add_e("IN_CATEGORY", NodeRef::var("cat"), vec![("tenant_id", PropertyInput::param("tenant_id")), ("confidence", PropertyInput::param("confidence"))]),
        )
        .var_as_if(
            "linkCatNew",
            BatchCondition::VarNotEmpty("catNew".to_string()),
            g().n(NodeRef::var("mem")).add_e("IN_CATEGORY", NodeRef::var("catNew"), vec![("tenant_id", PropertyInput::param("tenant_id")), ("confidence", PropertyInput::param("confidence"))]),
        )
        .var_as(
            "ent",
            g().n_with_label_where("Entity", SourcePredicate::eq("entityKey", Expr::param("entityKey")))
                .where_(Predicate::eq_param("tenant_id", "tenant_id")),
        )
        .var_as_if(
            "entNew",
            BatchCondition::VarEmpty("ent".to_string()),
            g().add_n(
                "Entity",
                vec![
                    ("entityKey", PropertyInput::param("entityKey")),
                    ("tenant_id", PropertyInput::param("tenant_id")),
                    ("name", PropertyInput::param("entityName")),
                    ("entityType", PropertyInput::param("entityType")),
                ],
            ),
        )
        .var_as_if(
            "mentions",
            BatchCondition::VarNotEmpty("ent".to_string()),
            g().n(NodeRef::var("mem")).add_e("MENTIONS", NodeRef::var("ent"), vec![("tenant_id", PropertyInput::param("tenant_id"))]),
        )
        .var_as_if(
            "mentionsNew",
            BatchCondition::VarNotEmpty("entNew".to_string()),
            g().n(NodeRef::var("mem")).add_e("MENTIONS", NodeRef::var("entNew"), vec![("tenant_id", PropertyInput::param("tenant_id"))]),
        )
        .returning(["mem"])
}
```

---

## 6. Updating — reinforce on access

```rust
#[register]
pub fn reinforce_memory(tenant_id: String, userId: String, memoryId: String, now: DateTime) -> WriteBatch {
    let _ = (&tenant_id, &userId, &memoryId, &now);

    write_batch()
        .var_as(
            "mem",
            g().n_with_label_where("Memory", SourcePredicate::eq("memoryId", Expr::param("memoryId")))
                .where_(current_user_memory_predicate("now", "userId"))
                .set_property("lastAccessedAt", PropertyInput::from(Expr::datetime()))
                .set_property("accessCount", Expr::prop("accessCount").add(Expr::val(1i64)))
                .set_property("salience", Expr::prop("salience").add(Expr::val(0.1f64))),
        )
        .returning(["mem"])
}
```

---

## 7. Correct/update — new memory supersedes old

```rust
#[register]
pub fn mark_memory_updated(tenant_id: String, userId: String, newId: String, oldId: String, reason: String) -> WriteBatch {
    let _ = (&tenant_id, &userId, &newId, &oldId, &reason);

    write_batch()
        .var_as(
            "old",
            g().n_with_label_where("Memory", SourcePredicate::eq("memoryId", Expr::param("oldId")))
                .where_(Predicate::and(vec![Predicate::eq_param("tenant_id", "tenant_id"), Predicate::eq_param("userId", "userId")])),
        )
        .var_as(
            "new",
            g().n_with_label_where("Memory", SourcePredicate::eq("memoryId", Expr::param("newId")))
                .where_(Predicate::and(vec![Predicate::eq_param("tenant_id", "tenant_id"), Predicate::eq_param("userId", "userId")])),
        )
        .var_as(
            "link",
            g().n(NodeRef::var("new")).add_e(
                "UPDATES",
                NodeRef::var("old"),
                vec![
                    ("tenant_id", PropertyInput::param("tenant_id")),
                    ("reason", PropertyInput::param("reason")),
                    ("at", PropertyInput::from(Expr::datetime())),
                ],
            ),
        )
        .var_as(
            "invalidate",
            g().n(NodeRef::var("old"))
                .set_property("isLatest", false)
                .set_property("validTo", PropertyInput::from(Expr::datetime())),
        )
        .returning(["link", "invalidate"])
}
```

---

## 8. Forgetting sweeps

```rust
#[register]
pub fn soft_delete_memory(tenant_id: String, userId: String, memoryId: String) -> WriteBatch {
    let _ = (&tenant_id, &userId, &memoryId);

    write_batch()
        .var_as(
            "mem",
            g().n_with_label_where("Memory", SourcePredicate::eq("memoryId", Expr::param("memoryId")))
                .where_(Predicate::and(vec![Predicate::eq_param("tenant_id", "tenant_id"), Predicate::eq_param("userId", "userId")]))
                .set_property("deletedAt", PropertyInput::from(Expr::datetime())),
        )
        .returning(["mem"])
}
```

```rust
#[register]
pub fn decay_sweep(tenant_id: String, cutoff: DateTime, minSalience: f64, minAccess: i64) -> WriteBatch {
    let _ = (&tenant_id, &cutoff, &minSalience, &minAccess);

    write_batch()
        .var_as(
            "decayed",
            g().n_with_label_where("Memory", SourcePredicate::eq("tenant_id", Expr::param("tenant_id")))
                .where_(Predicate::and(vec![
                    Predicate::is_null("deletedAt"),
                    Predicate::eq("isLatest", true),
                    Predicate::lt_param("lastAccessedAt", "cutoff"),
                    Predicate::lt_param("salience", "minSalience"),
                    Predicate::lt_param("accessCount", "minAccess"),
                ]))
                .set_property("deletedAt", PropertyInput::from(Expr::datetime())),
        )
        .returning(["decayed"])
}
```

```rust
#[register]
pub fn expiry_sweep(tenant_id: String, now: DateTime) -> WriteBatch {
    let _ = (&tenant_id, &now);

    write_batch()
        .var_as(
            "expired",
            g().n_with_label_where("Memory", SourcePredicate::eq("tenant_id", Expr::param("tenant_id")))
                .where_(Predicate::and(vec![
                    Predicate::is_null("deletedAt"),
                    Predicate::is_not_null("expiresAt"),
                    Predicate::lt_param("expiresAt", "now"),
                ]))
                .set_property("deletedAt", PropertyInput::from(Expr::datetime())),
        )
        .returning(["expired"])
}
```

---

## 9. Hybrid retrieval — profile + memories + source chunks

```rust
#[register]
pub fn hybrid_recall(
    tenant_id: String,
    userId: String,
    embedding: Vec<f32>,
    query: String,
    k: i64,
    now: DateTime,
) -> ReadBatch {
    let _ = (&tenant_id, &userId, &embedding, &query, &k, &now);

    read_batch()
        .var_as(
            "profile",
            g().n_with_label_where("UserProfile", SourcePredicate::eq("tenant_id", Expr::param("tenant_id")))
                .where_(Predicate::eq_param("userId", "userId"))
                .project(vec![
                    PropertyProjection::new("staticSummary"),
                    PropertyProjection::new("dynamicSummary"),
                ]),
        )
        .var_as(
            "memorySemantic",
            g().vector_search_nodes_with(
                "Memory",
                "embedding",
                PropertyInput::param("embedding"),
                Expr::param("k"),
                Some(PropertyInput::param("tenant_id")),
            )
            .where_(current_user_memory_predicate("now", "userId"))
            .project(vec![
                PropertyProjection::renamed("memoryId", "id"),
                PropertyProjection::new("content"),
                PropertyProjection::new("kind"),
                PropertyProjection::new("salience"),
                PropertyProjection::new("lastAccessedAt"),
                PropertyProjection::new("documentId"),
                PropertyProjection::new("chunkId"),
                PropertyProjection::renamed("$distance", "distance"),
            ]),
        )
        .var_as(
            "memoryKeyword",
            g().text_search_nodes_with(
                "Memory",
                "content",
                PropertyInput::param("query"),
                Expr::param("k"),
                Some(PropertyInput::param("tenant_id")),
            )
            .where_(current_user_memory_predicate("now", "userId"))
            .project(vec![
                PropertyProjection::renamed("memoryId", "id"),
                PropertyProjection::new("content"),
                PropertyProjection::new("kind"),
                PropertyProjection::new("salience"),
                PropertyProjection::new("lastAccessedAt"),
                PropertyProjection::new("documentId"),
                PropertyProjection::new("chunkId"),
                PropertyProjection::renamed("$distance", "score"),
            ]),
        )
        .var_as(
            "chunkSemantic",
            g().vector_search_nodes_with(
                "Chunk",
                "embedding",
                PropertyInput::param("embedding"),
                Expr::param("k"),
                Some(PropertyInput::param("tenant_id")),
            )
            .where_(live_user_chunk_predicate("userId"))
            .project(vec![
                PropertyProjection::renamed("chunkId", "id"),
                PropertyProjection::new("documentId"),
                PropertyProjection::new("content"),
                PropertyProjection::new("ordinal"),
                PropertyProjection::renamed("$distance", "distance"),
            ]),
        )
        .var_as(
            "chunkKeyword",
            g().text_search_nodes_with(
                "Chunk",
                "content",
                PropertyInput::param("query"),
                Expr::param("k"),
                Some(PropertyInput::param("tenant_id")),
            )
            .where_(live_user_chunk_predicate("userId"))
            .project(vec![
                PropertyProjection::renamed("chunkId", "id"),
                PropertyProjection::new("documentId"),
                PropertyProjection::new("content"),
                PropertyProjection::new("ordinal"),
                PropertyProjection::renamed("$distance", "score"),
            ]),
        )
        .returning(["profile", "memorySemantic", "memoryKeyword", "chunkSemantic", "chunkKeyword"])
}
```

Fuse and rerank the returned lists in application code with RRF as shown in `EXAMPLES.md` and `REFERENCE.md`.

---

## 10. Bounded graph expansion

```rust
#[register]
pub fn expand_via_entities(tenant_id: String, userId: String, memoryId: String, now: DateTime) -> ReadBatch {
    let _ = (&tenant_id, &userId, &memoryId, &now);

    read_batch()
        .var_as(
            "related",
            g().n_with_label_where("Memory", SourcePredicate::eq("memoryId", Expr::param("memoryId")))
                .where_(Predicate::and(vec![Predicate::eq_param("tenant_id", "tenant_id"), Predicate::eq_param("userId", "userId")]))
                .out(Some("MENTIONS"))
                .in_(Some("MENTIONS"))
                .dedup()
                .where_(current_user_memory_predicate("now", "userId"))
                .limit(10usize)
                .project(vec![
                    PropertyProjection::new("memoryId"),
                    PropertyProjection::new("content"),
                    PropertyProjection::new("kind"),
                ]),
        )
        .returning(["related"])
}
```
