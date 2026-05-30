# Helix Query Authoring — Rust Examples

Each numbered scenario corresponds 1:1 with `../helix-query-typescript/EXAMPLES.md` and `../helix-query-json-dynamic/EXAMPLES.md`. When moving between the Rust DSL, TypeScript DSL, and inline JSON, open the same scenario in each file.

All snippets assume `use helix_db::dsl::prelude::*;`.

---

## 1. Count nodes matching label + predicate

```rust
#[register]
pub fn active_user_count() -> ReadBatch {
    read_batch()
        .var_as(
            "active_count",
            g().n_with_label("User")
                .where_(Predicate::eq("status", "active"))
                .count(),
        )
        .returning(["active_count"])
}
```

---

## 2. Read node by indexed property with projection

Literal form:

```rust
#[register]
pub fn user_by_id_literal() -> ReadBatch {
    read_batch()
        .var_as(
            "user",
            g().n_with_label_where(
                "User",
                SourcePredicate::eq("userId", "u-42"),
            )
            .project(vec![
                PropertyProjection::renamed("$id", "id"),
                PropertyProjection::new("userId"),
                PropertyProjection::new("name"),
            ]),
        )
        .returning(["user"])
}
```

Parameterized form (preferred):

```rust
#[register]
pub fn user_by_id(userId: String) -> ReadBatch {
    let _ = &userId;
    read_batch()
        .var_as(
            "user",
            g().n_with_label("User")
                .where_(Predicate::eq_param("userId", "userId"))
                .project(vec![
                    PropertyProjection::renamed("$id", "id"),
                    PropertyProjection::new("name"),
                ]),
        )
        .returning(["user"])
}
```

---

## 3. Multi-hop traversal with `dedup` + `limit`

```rust
#[register]
pub fn friends_of_friends(userId: Vec<i64>) -> ReadBatch {
    let _ = &userId;
    read_batch()
        .var_as(
            "fof",
            g().n(NodeRef::param("userId"))
                .out(Some("FOLLOWS"))
                .out(Some("FOLLOWS"))
                .dedup()
                .limit(50usize)
                .values(vec!["$id", "name"]),
        )
        .returning(["fof"])
}
```

---

## 4. Vector search with tenant + distance in projection

```rust
#[register]
pub fn nearest_documents(
    tenantId: String,
    queryVector: Vec<f64>,
    k: i64,
) -> ReadBatch {
    let _ = (&tenantId, &queryVector, &k);
    read_batch()
        .var_as(
            "hits",
            g().vector_search_nodes_with(
                "Document",
                "embedding",
                PropertyInput::param("queryVector"),
                Expr::param("k"),
                Some(PropertyInput::param("tenantId")),
            )
            .project(vec![
                PropertyProjection::renamed("$id", "id"),
                PropertyProjection::new("title"),
                PropertyProjection::renamed("$distance", "distance"),
            ]),
        )
        .returning(["hits"])
}
```

Project `$distance` before any `.out`/`.in_`/`.both` — traversal off the hit stream drops the distance metadata.

---

## 5. BM25 text search with post-filter

```rust
#[register]
pub fn document_search(
    tenantId: String,
    q: String,
) -> ReadBatch {
    let _ = (&tenantId, &q);
    read_batch()
        .var_as(
            "results",
            g().text_search_nodes_with(
                "Document",
                "body",
                PropertyInput::param("q"),
                50usize,
                Some(PropertyInput::param("tenantId")),
            )
            .where_(Predicate::eq("published", true))
            .limit(10usize)
            .project(vec![
                PropertyProjection::renamed("$id", "id"),
                PropertyProjection::new("title"),
                PropertyProjection::renamed("$distance", "score"),
            ]),
        )
        .returning(["results"])
}
```

---

## 6. `Repeat` traversal with `until` + `emit_after`

```rust
#[register]
pub fn management_chain(startId: Vec<i64>) -> ReadBatch {
    let _ = &startId;
    read_batch()
        .var_as(
            "chain",
            g().n(NodeRef::param("startId"))
                .repeat(
                    RepeatConfig::new(sub().out(Some("REPORTS_TO")))
                        .until(Predicate::eq("title", "CEO"))
                        .emit_after()
                        .max_depth(10),
                )
                .project(vec![
                    PropertyProjection::renamed("$id", "id"),
                    PropertyProjection::new("name"),
                    PropertyProjection::new("title"),
                ]),
        )
        .returning(["chain"])
}
```

---

## 7. `Union` of two sub-traversals

```rust
#[register]
pub fn user_network(userId: Vec<i64>) -> ReadBatch {
    let _ = &userId;
    read_batch()
        .var_as(
            "network",
            g().n(NodeRef::param("userId"))
                .union(vec![
                    sub().out(Some("FOLLOWS")),
                    sub().in_(Some("FOLLOWS")),
                ])
                .dedup()
                .values(vec!["$id", "name"]),
        )
        .returning(["network"])
}
```

---

## 8. `Choose` (conditional traversal)

```rust
#[register]
pub fn user_content(userId: Vec<i64>) -> ReadBatch {
    let _ = &userId;
    read_batch()
        .var_as(
            "content",
            g().n(NodeRef::param("userId"))
                .choose(
                    Predicate::eq("tier", "premium"),
                    sub().out(Some("HAS_PREMIUM")),
                    Some(sub().out(Some("HAS_FREE"))),
                )
                .limit(20usize)
                .value_map(Some(vec!["$id", "title"])),
        )
        .returning(["content"])
}
```

---

## 9. `Coalesce` (fallback traversal)

```rust
#[register]
pub fn preferred_team(userId: Vec<i64>) -> ReadBatch {
    let _ = &userId;
    read_batch()
        .var_as(
            "team",
            g().n(NodeRef::param("userId"))
                .coalesce(vec![
                    sub().out(Some("PREFERRED_TEAM")),
                    sub().out(Some("PRIMARY_TEAM")),
                    sub().out(Some("MEMBER_OF")).limit(1usize),
                ])
                .values(vec!["$id", "name"]),
        )
        .returning(["team"])
}
```

---

## 10. `Project` with `Expr::case` (computed field)

```rust
#[register]
pub fn users_with_bucket() -> ReadBatch {
    read_batch()
        .var_as(
            "users",
            g().n_with_label("User").project(vec![
                Projection::property("$id", "id"),
                Projection::property("score", "score"),
                Projection::expr(
                    "bucket",
                    Expr::case(
                        vec![
                            (
                                Predicate::gte("score", 1000i64),
                                Expr::val("high"),
                            ),
                            (
                                Predicate::gte("score", 100i64),
                                Expr::val("mid"),
                            ),
                        ],
                        Some(Expr::val("low")),
                    ),
                ),
            ]),
        )
        .returning(["users"])
}
```

---

## 11. Aggregation: `group_count` and `aggregate_by`

```rust
#[register]
pub fn users_by_status() -> ReadBatch {
    read_batch()
        .var_as(
            "by_status",
            g().n_with_label("User").group_count("status"),
        )
        .returning(["by_status"])
}

#[register]
pub fn total_revenue() -> ReadBatch {
    read_batch()
        .var_as(
            "revenue",
            g().n_with_label("Order")
                .aggregate_by(AggregateFunction::Sum, "price"),
        )
        .returning(["revenue"])
}
```

---

## 12. Write: `add_n` + `add_e` in one batch with cross-entry `Var` reference

```rust
#[register]
pub fn create_user_and_link_post(
    userId: String,
    name: String,
    postId: Vec<i64>,
) -> WriteBatch {
    let _ = (&userId, &name, &postId);
    write_batch()
        .var_as(
            "newUser",
            g().add_n(
                "User",
                vec![
                    ("userId", PropertyInput::param("userId")),
                    ("name", PropertyInput::param("name")),
                    ("createdAt", PropertyInput::from(Expr::timestamp())),
                ],
            )
            .project(vec![PropertyProjection::renamed("$id", "id")]),
        )
        .var_as(
            "link",
            g().n(NodeRef::param("postId"))
                .add_e::<&str, PropertyInput>("CREATED_BY", NodeRef::var("newUser"), vec![]),
        )
        .returning(["newUser", "link"])
}
```

---

## 13. Write: upsert via `var_as_if`

```rust
#[register]
pub fn upsert_user(userId: String, name: String) -> WriteBatch {
    let _ = (&userId, &name);
    write_batch()
        .var_as(
            "existing",
            g().n_with_label("User")
                .where_(Predicate::eq_param("userId", "userId")),
        )
        .var_as_if(
            "updated",
            BatchCondition::VarNotEmpty("existing".to_string()),
            g().n(NodeRef::var("existing"))
                .set_property("name", PropertyInput::param("name")),
        )
        .var_as_if(
            "created",
            BatchCondition::VarEmpty("existing".to_string()),
            g().add_n(
                "User",
                vec![
                    ("userId", PropertyInput::param("userId")),
                    ("name", PropertyInput::param("name")),
                ],
            ),
        )
        .returning(["updated", "created"])
}
```

---

## 14. Write: `for_each_param` over an array of objects

```rust
#[register]
pub fn bulk_create_users(data: Vec<ParamObject>) -> WriteBatch {
    let _ = &data;
    let body = write_batch().var_as(
        "created",
        g().add_n(
            "User",
            vec![
                ("externalId", PropertyInput::param("externalId")),
                ("embedding", PropertyInput::param("embedding")),
            ],
        ),
    );
    write_batch()
        .for_each_param("data", body)
        .returning(["created"])
}
```

Inside `body`, the parameter names resolve against each object's fields. Registering with `data: Vec<ParamObject>` makes the macro record `QueryParamType::Array(Box::new(QueryParamType::Object))`, which is exactly `{"Array": "Object"}` on the wire.

---

## 15. Typed-array parameter + `DateTime` parameter

```rust
#[register]
pub fn users_filtered(
    statuses: Vec<String>,
    since: DateTime,
) -> ReadBatch {
    let _ = (&statuses, &since);
    read_batch()
        .var_as(
            "users",
            g().n_with_label("User")
                .where_(Predicate::and(vec![
                    Predicate::is_in_param("status", "statuses"),
                    Predicate::gte_param("createdAt", "since"),
                ]))
                .values(vec!["$id", "status", "createdAt"]),
        )
        .returning(["users"])
}
```

The macro records `statuses` as `{"Array": "String"}` and `since` as `"DateTime"`. On the client, pass any RFC3339 string or epoch-millis integer; the wrapper normalizes to UTC RFC3339 before serializing.

---

## 16. Write: index management

```rust
#[register]
pub fn bootstrap_indexes() -> WriteBatch {
    write_batch()
        .var_as(
            "idx_userId",
            g().create_index_if_not_exists(IndexSpec::node_unique_equality("User", "userId")),
        )
        .var_as(
            "idx_embedding",
            g().create_index_if_not_exists(IndexSpec::node_vector(
                "Document",
                "embedding",
                Some("tenantId"),
            )),
        )
        .var_as(
            "idx_body",
            g().create_index_if_not_exists(IndexSpec::node_text(
                "Document",
                "body",
                Some("tenantId"),
            )),
        )
        .returning(["idx_userId", "idx_embedding", "idx_body"])
}
```

Drop an index with `g().drop_index(IndexSpec::...)`. The convenience methods (`create_vector_index_nodes`, etc.) are available but produce identical wire output — prefer `create_index_if_not_exists` + `IndexSpec` for consistency with the dynamic JSON reference.

---

## 17. Warm a read route

Warming uses the *same* query body; the header (`X-Helix-Warm: true`) is applied on the HTTP client. Build the request and let callers decide to warm:

```rust
use helix_db::dsl::prelude::*;

let req = user_by_id("u-42".to_string())?;
let body = req.to_json_string()?;
// Send via reqwest / curl / etc:
//   POST /v1/query
//   X-Helix-Warm: true
//   Content-Type: application/json
//   <body>
// A successful warm returns 204 No Content. Writes reject warming.
```

Warming is strictly read-only; a `WriteBatch` with `X-Helix-Warm: true` is rejected by the gateway.
