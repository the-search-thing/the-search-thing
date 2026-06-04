# Helix Query Optimization — Paired Examples

Each section presents a "weaker" form (slower or less-correct) and a "stronger" form (the optimization), in **both** Rust DSL and JSON dynamic forms. Lines with `interpreter.rs:N` cite the mechanism in the Helix interpreter; `dsl.rs:N` cites the DSL (`sdks/rust/src/dsl.rs`). JSON encoding follows the rules in `../helix-query-json-dynamic/REFERENCE.md` (externally-tagged Serde). The Rust DSL shown here has a 1:1 TypeScript equivalent — see `../helix-query-typescript/`.

DSL examples assume `use helix_db::dsl::prelude::*;`. JSON examples are either complete `POST /v1/query` bodies (envelope present) or step-level snippets when only the step shape is the point — both are explicitly marked.

---

## 1. Anchor on an id, not a label scan

When the application already knows the id, never scan.

### Weaker — label scan + property filter

```rust
read_batch()
    .var_as(
        "user",
        g().n_with_label("User")
            .where_(Predicate::eq("userId", "u-42")),
    )
    .returning(["user"])
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "user",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"Where": {"Eq": ["userId", {"String": "u-42"}]}}
        ],
        "condition": null
      }}
    ],
    "returns": ["user"]
  }
}
```

This still indexes if there is a scoped equality index on `(User, userId)` (the `Where` re-enters the dispatcher at `interpreter.rs:3911-3966`). But if you already know the internal node id, skip the predicate work entirely.

### Stronger — anchor by id

```rust
read_batch()
    .var_as("user", g().n(NodeRef::id(644)))
    .returning(["user"])
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "user",
        "steps": [{"N": {"Ids": [644]}}],
        "condition": null
      }}
    ],
    "returns": ["user"]
  }
}
```

`Step::N(NodeRef::Ids)` dispatches at `interpreter.rs:5912-5920` — direct id set, no index lookup, no scan.

---

## 2. Push the predicate to the source position

Two forms: literal value (use `SourcePredicate`), parameterized value (use `where_` after `n_with_label`).

### Literal value

```rust
read_batch()
    .var_as(
        "active_orders",
        g().n_with_label_where(
            "Order",
            SourcePredicate::eq("status", "active"),
        ),
    )
    .returning(["active_orders"])
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "active_orders",
        "steps": [
          {"NWhere": {"And": [
            {"Eq": ["$label", {"String": "Order"}]},
            {"Eq": ["status", {"String": "active"}]}
          ]}}
        ],
        "condition": null
      }}
    ],
    "returns": ["active_orders"]
  }
}
```

`n_with_label_where` desugars to `NWhere(And([Eq("$label","Order"), Eq("status","active")]))` (`dsl.rs:3233`). The dispatcher walks the `And`, derives the label scope at `interpreter.rs:2620-2621`, and uses the scoped equality index on `(Order, status)` at `interpreter.rs:2625-2636`.

### Parameterized value

```rust
#[register]
pub fn user_by_id(userId: String) -> ReadBatch {
    let _ = &userId;
    read_batch()
        .var_as(
            "user",
            g().n_with_label("User")
                .where_(Predicate::eq_param("userId", "userId")),
        )
        .returning(["user"])
}
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "user",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"Where": {"Compare": {
            "left": {"Property": "userId"},
            "op": "Eq",
            "right": {"Param": "userId"}
          }}}
        ],
        "condition": null
      }}
    ],
    "returns": ["user"]
  }
}
```

`Predicate::eq_param` builds `Compare { left: Property, op: Eq, right: Param }`. The dispatcher's `Compare` arm at `interpreter.rs:2928-2944` calls `extract_param_compare`, resolves the param to a literal, and routes through the same equality-index path. The label scope from `n_with_label("User")` carries to the `Where` dispatch at `interpreter.rs:3911-3939`, so the scoped index is consulted. Without `n_with_label`, the predicate would fall back to a full scan.

---

## 3. Don't filter on a non-index-eligible predicate at the source

`Contains`, `EndsWith`, `Not`, `IsNull`, `IsNotNull` are never index-eligible.

### Weaker — substring search at the source

```rust
read_batch()
    .var_as(
        "matches",
        g().n_with_label("Document")
            .where_(Predicate::contains("title", "annual report")),
    )
    .returning(["matches"])
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "matches",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "Document"}]}},
          {"Where": {"Contains": ["title", "annual report"]}}
        ],
        "condition": null
      }}
    ],
    "returns": ["matches"]
  }
}
```

`Contains` is in the `_ => Ok(None)` arm at `interpreter.rs:2946`. The runtime full-scans the `Document` label set, loads every node's properties, then runs `predicate_matches` (`interpreter.rs:511, 3973`).

### Stronger — BM25 text index

```rust
read_batch()
    .var_as(
        "matches",
        g().text_search_nodes_with(
            "Document",
            "title",
            PropertyInput::param("query"),
            Expr::param("k"),
            Some(PropertyInput::param("tenantId")),
        )
        .project(vec![
            PropertyProjection::new("$id"),
            PropertyProjection::new("title"),
            PropertyProjection::renamed("$score", "score"),
        ]),
    )
    .returning(["matches"])
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "matches",
        "steps": [
          {"TextSearchNodes": {
            "label": "Document",
            "property": "title",
            "query_text": {"Expr": {"Param": "query"}},
            "k": {"Expr": {"Param": "k"}},
            "tenant_value": {"Expr": {"Param": "tenantId"}}
          }},
          {"Project": [
            {"source": "$id", "alias": "$id"},
            {"source": "title", "alias": "title"},
            {"source": "$score", "alias": "score"}
          ]}
        ],
        "condition": null
      }}
    ],
    "returns": ["matches"]
  },
  "parameters": {"query": "annual report", "k": 25, "tenantId": "acme"},
  "parameter_types": {"query": "String", "k": "I64", "tenantId": "String"}
}
```

BM25 dispatches at `interpreter.rs:6068-6111`. The result is `RankedVertices` carrying a `$score` per hit, ordered descending.

---

## 4. Pass `tenant_value` for tenant-scoped vector search

A tenant-scoped index requires the tenant value at search time. Post-filtering is wrong — it operates on the wrong-tenant or global top-k.

### Weaker — tenant as a post-filter

```rust
read_batch()
    .var_as(
        "neighbors",
        g().vector_search_nodes_with(
            "Document",
            "embedding",
            PropertyInput::param("queryVector"),
            Expr::param("k"),
            None,  // <-- no tenant_value
        )
        .where_(Predicate::eq_param("tenantId", "tenantId")),
    )
    .returning(["neighbors"])
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "neighbors",
        "steps": [
          {"VectorSearchNodes": {
            "label": "Document",
            "property": "embedding",
            "query_vector": {"Expr": {"Param": "queryVector"}},
            "k": {"Expr": {"Param": "k"}},
            "tenant_value": null
          }},
          {"Where": {"Compare": {
            "left": {"Property": "tenantId"},
            "op": "Eq",
            "right": {"Param": "tenantId"}
          }}}
        ],
        "condition": null
      }}
    ],
    "returns": ["neighbors"]
  },
  "parameters": {"queryVector": [0.1, 0.2, 0.3], "k": 50, "tenantId": "acme"},
  "parameter_types": {"queryVector": {"Array": "F64"}, "k": "I64", "tenantId": "String"}
}
```

The k-NN already returned the global top-`k`; the post-filter then keeps only the matching tenant's hits — likely far fewer than `k` (often zero).

### Stronger — tenant pushed into the search

```rust
read_batch()
    .var_as(
        "neighbors",
        g().vector_search_nodes_with(
            "Document",
            "embedding",
            PropertyInput::param("queryVector"),
            Expr::param("k"),
            Some(PropertyInput::param("tenantId")),
        ),
    )
    .returning(["neighbors"])
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "neighbors",
        "steps": [
          {"VectorSearchNodes": {
            "label": "Document",
            "property": "embedding",
            "query_vector": {"Expr": {"Param": "queryVector"}},
            "k": {"Expr": {"Param": "k"}},
            "tenant_value": {"Expr": {"Param": "tenantId"}}
          }}
        ],
        "condition": null
      }}
    ],
    "returns": ["neighbors"]
  },
  "parameters": {"queryVector": [0.1, 0.2, 0.3], "k": 50, "tenantId": "acme"},
  "parameter_types": {"queryVector": {"Array": "F64"}, "k": "I64", "tenantId": "String"}
}
```

`resolve_vector_search_index_name` (`interpreter.rs:5222-5238`) routes the query to the tenant-partitioned HNSW graph. The `k` hits come from the right tenant.

---

## 5. Project `$distance` before traversing off the hit stream

`Out`/`In`/`Both`/`*N`/`Where`/`OrderBy` discard the `RankedVertices` hits via `as_vertices()` (`interpreter.rs:1407-1411, 6753`). After that, `$distance` is `null`.

### Weaker — distance lost after `out`

```rust
read_batch()
    .var_as(
        "related",
        g().vector_search_nodes_with(
            "Document", "embedding",
            PropertyInput::param("qv"),
            Expr::param("k"),
            Some(PropertyInput::param("tenantId")),
        )
        .out(Some("MENTIONS"))
        .project(vec![
            PropertyProjection::new("$id"),
            PropertyProjection::new("name"),
            PropertyProjection::renamed("$distance", "distance"), // null
        ]),
    )
    .returning(["related"])
```

```json
{"VectorSearchNodes": {"label":"Document","property":"embedding","query_vector":{"Expr":{"Param":"qv"}},"k":{"Expr":{"Param":"k"}},"tenant_value":{"Expr":{"Param":"tenantId"}}}},
{"Out": "MENTIONS"},
{"Project": [
  {"source":"$id","alias":"$id"},
  {"source":"name","alias":"name"},
  {"source":"$distance","alias":"distance"}
]}
```

After `Out("MENTIONS")` the state is `Vertices(_)`, not `RankedVertices`. The `$distance` projection reads from a state that no longer has hits — it returns `null`.

### Stronger — store hits, project distance, then traverse separately

```rust
read_batch()
    .var_as(
        "hits",
        g().vector_search_nodes_with(
            "Document", "embedding",
            PropertyInput::param("qv"),
            Expr::param("k"),
            Some(PropertyInput::param("tenantId")),
        )
        .project(vec![
            PropertyProjection::new("$id"),
            PropertyProjection::new("name"),
            PropertyProjection::renamed("$distance", "distance"),
        ]),
    )
    .var_as(
        "related",
        g().n(NodeRef::var("hits")).out(Some("MENTIONS")),
    )
    .returning(["hits", "related"])
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "hits",
        "steps": [
          {"VectorSearchNodes": {"label":"Document","property":"embedding","query_vector":{"Expr":{"Param":"qv"}},"k":{"Expr":{"Param":"k"}},"tenant_value":{"Expr":{"Param":"tenantId"}}}},
          {"Project": [
            {"source":"$id","alias":"$id"},
            {"source":"name","alias":"name"},
            {"source":"$distance","alias":"distance"}
          ]}
        ],
        "condition": null
      }},
      {"Query": {
        "name": "related",
        "steps": [
          {"N": {"Var": "hits"}},
          {"Out": "MENTIONS"}
        ],
        "condition": null
      }}
    ],
    "returns": ["hits", "related"]
  }
}
```

The first batch entry projects `$distance` while still on `RankedVertices`; the second uses `NodeRef::Var("hits")` to traverse from the same id set without re-running the search.

---

## 6. Pair `Limit` with the step you want bounded; pair `OrderBy` with a range index

The lookahead at `interpreter.rs:787-827` matches `step → Limit` and `step → Dedup → Limit`. A chain of filters between them defeats it.

### Weaker — limit after filters; OrderBy without a range index

```rust
g().n_with_label("Order")
    .where_(Predicate::eq("region", "EU"))
    .where_(Predicate::gt("amount", PropertyValue::F64(100.0)))
    .order_by("createdAt", Order::Desc)
    .limit(10)
```

```json
[
  {"NWhere": {"Eq": ["$label", {"String": "Order"}]}},
  {"Where": {"Eq": ["region", {"String": "EU"}]}},
  {"Where": {"Gt": ["amount", {"F64": 100.0}]}},
  {"OrderBy": ["createdAt", "Desc"]},
  {"Limit": 10}
]
```

If no range index exists for `(Order, createdAt)`, `OrderBy` loads every matching property and sorts in memory (`interpreter.rs:7061-7091`). The `Limit` then takes 10 from the sorted vector — `OrderBy` already paid the full sort cost.

### Stronger — anchor with index-eligible predicates, OrderBy + Limit on a range index

```rust
g().n_with_label_where(
    "Order",
    SourcePredicate::and(vec![
        SourcePredicate::eq("region", "EU"),
        SourcePredicate::gt("amount", PropertyValue::F64(100.0)),
    ]),
)
.order_by("createdAt", Order::Desc)
.limit(10)
```

```json
[
  {"NWhere": {"And": [
    {"Eq": ["$label", {"String": "Order"}]},
    {"Eq": ["region", {"String": "EU"}]},
    {"Gt": ["amount", {"F64": 100.0}]}
  ]}},
  {"OrderBy": ["createdAt", "Desc"]},
  {"Limit": 10}
]
```

With a scoped equality index on `(Order, region)` and a range index on `(Order, amount)`, the `And` dispatcher (`interpreter.rs:2858-2904`) intersects the two indexed sets. With a range index on `(Order, createdAt)`, `order_by_from_range_index` (`interpreter.rs:829-863`) walks the range index in descending key order and stops after 10 — no in-memory sort.

---

## 7. Bound `Repeat` and order `Coalesce` by cost

### Weaker — unbounded repeat, expensive `Coalesce` first

```rust
g().n(NodeRef::param("startId"))
    .repeat(
        RepeatConfig::new(sub().out(Some("KNOWS")))
            .until(Predicate::eq("name", "target")),
        // no max_depth, no times
    )
```

```rust
g().n_with_label("User")
    .coalesce(vec![
        sub().vector_search_nodes_with("User", "embedding", /* expensive */ ...),
        sub().n(NodeRef::var("hot_user_id")),  // cheap, often hits
    ])
```

### Stronger — bounded repeat, cheap branch first

```rust
g().n(NodeRef::param("startId"))
    .repeat(
        RepeatConfig::new(sub().out(Some("KNOWS")))
            .until(Predicate::eq("name", "target"))
            .max_depth(6),
    )
```

```rust
g().coalesce(vec![
    sub().n(NodeRef::var("hot_user_id")),  // cheap probe first
    sub().vector_search_nodes_with("User", "embedding", /* expensive fallback */ ...),
])
```

JSON form for the bounded repeat:

```json
{"Repeat": {
  "traversal": {"steps": [{"Out": "KNOWS"}]},
  "times": null,
  "until": {"Eq": ["name", {"String": "target"}]},
  "emit": "After",
  "emit_predicate": null,
  "max_depth": 6
}}
```

`Step::Repeat` checks `max_depth` at `interpreter.rs:9291`. `Step::Coalesce` (`interpreter.rs:7593-7610`) returns on the first non-empty branch — putting the cheap probe first means the expensive branch never runs on cache hits.

---

## 8. Slim projections — never `value_map(None)` on nodes that store embeddings

`value_map(None)` always loads all properties (`interpreter.rs:9664`). For node types that store embeddings inline, the network and serialization cost dominates.

### Weaker

```rust
g().vector_search_nodes_with(...)
    .value_map(None::<Vec<&str>>)
```

```json
[
  {"VectorSearchNodes": {...}},
  {"ValueMap": null}
]
```

### Stronger

```rust
g().vector_search_nodes_with(...)
    .project(vec![
        PropertyProjection::new("$id"),
        PropertyProjection::new("title"),
        PropertyProjection::renamed("$distance", "distance"),
    ])
```

```json
[
  {"VectorSearchNodes": {...}},
  {"Project": [
    {"source":"$id","alias":"$id"},
    {"source":"title","alias":"title"},
    {"source":"$distance","alias":"distance"}
  ]}
]
```

The runtime still loads all properties from storage for `Project` — the saving is the response payload size and the serialization cost. To avoid loading entirely, return only the count or the id list (`count()`, `id()`).

---

## 9. Upsert with an indexed lookup, then `add_n` only when missing

### Weaker — `add_n` without an existence check (creates duplicates)

```rust
write_batch()
    .var_as("created", g().add_n("User", vec![
        ("userId", PropertyInput::param("userId")),
        ("name", PropertyInput::param("name")),
    ]))
    .returning(["created"])
```

Calling this twice with `userId = "u-42"` allocates two distinct internal ids both holding `userId = "u-42"`.

### Stronger — load, branch, write

```rust
write_batch()
    .var_as(
        "existing",
        g().n_with_label_where(
            "User",
            SourcePredicate::eq("userId", "u-42"),
        ),
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
        g().add_n("User", vec![
            ("userId", PropertyInput::param("userId")),
            ("name", PropertyInput::param("name")),
        ]),
    )
    .returning(["updated", "created"])
```

```json
{
  "request_type": "write",
  "query": {
    "queries": [
      {"Query": {
        "name": "existing",
        "steps": [
          {"NWhere": {"And": [
            {"Eq": ["$label", {"String": "User"}]},
            {"Eq": ["userId", {"String": "u-42"}]}
          ]}}
        ],
        "condition": null
      }},
      {"Query": {
        "name": "updated",
        "steps": [
          {"N": {"Var": "existing"}},
          {"SetProperty": ["name", {"Expr": {"Param": "name"}}]}
        ],
        "condition": {"VarNotEmpty": "existing"}
      }},
      {"Query": {
        "name": "created",
        "steps": [
          {"AddN": {
            "label": "User",
            "properties": [
              ["userId", {"Expr": {"Param": "userId"}}],
              ["name", {"Expr": {"Param": "name"}}]
            ]
          }}
        ],
        "condition": {"VarEmpty": "existing"}
      }}
    ],
    "returns": ["updated", "created"]
  },
  "parameters": {"name": "Alice"},
  "parameter_types": {"name": "String"}
}
```

The lookup at `existing` must hit a scoped equality index on `(User, userId)`. Without that index, every upsert pays a full label scan.

---

## 10. Use `drop_edge_by_id` on multigraphs

`Step::DropEdge(to)` removes *all* edges between the source and target — label-agnostic (`interpreter.rs:9089-9098`). On a multigraph with multiple labeled edges between the same pair, this deletes more than intended.

### Weaker — label-agnostic drop

```rust
write_batch()
    .var_as(
        "_dropped",
        g().n(NodeRef::param("from"))
            .drop_edge(NodeRef::param("to")),
    )
    .returning([])
```

### Better — scoped by label

```rust
write_batch()
    .var_as(
        "_dropped",
        g().n(NodeRef::param("from"))
            .drop_edge_labeled(NodeRef::param("to"), "FOLLOWS"),
    )
    .returning([])
```

### Best — by edge id (multigraph-safe)

```rust
write_batch()
    .var_as(
        "_dropped",
        g().e(EdgeRef::param("edgeIds")).drop_edge_by_id(EdgeRef::param("edgeIds")),
    )
    .returning([])
```

```json
{
  "request_type": "write",
  "query": {
    "queries": [
      {"Query": {
        "name": "_dropped",
        "steps": [
          {"DropEdgeById": {"Ids": [42, 43, 44]}}
        ],
        "condition": null
      }}
    ],
    "returns": []
  }
}
```

`Step::DropEdgeById` removes the listed edge ids (`interpreter.rs:9136-9149`) — the only safe form on a multigraph.

---

## 11. Stored vs dynamic + warming

Use a stored route for steady traffic; warm the cache at startup.

### Stored route (Rust DSL, `#[register]`)

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
                    PropertyProjection::new("email"),
                ]),
        )
        .returning(["user"])
}
```

The `#[register]` macro publishes the route once at compile time; no per-request AST parse / validation.

### Dynamic warming request (read-only)

```http
POST /v1/query
X-Helix-Warm: true
Content-Type: application/json

{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "user",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"Where": {"Compare": {
            "left": {"Property": "userId"},
            "op": "Eq",
            "right": {"Param": "userId"}
          }}}
        ],
        "condition": null
      }}
    ],
    "returns": ["user"]
  },
  "parameters": {"userId": "u-42"}
}
```

The gateway responds `204 No Content` on success and populates caches. The same request with `request_type: "write"` is rejected (writes cannot be warmed). Use warming for hot read routes after deploys or cold restarts.

---

## 12. Cross-skill cheat sheet

| Optimization | DSL builder | JSON variant | Mechanism cite |
|---|---|---|---|
| Anchor on id | `g().n(NodeRef::id(n))` | `{"N": {"Ids": [n]}}` | `interpreter.rs:5912` |
| Push label scope | `g().n_with_label_where(L, SP)` | `{"NWhere": {"And": [{"Eq": ["$label", {"String": "L"}]}, ...]}}` | `interpreter.rs:2620, dsl.rs:3233` |
| Index-eligible predicate (literal) | `SourcePredicate::eq/between/gt/...` | `{"Eq": [...]}`, `{"Between": [...]}`, ... | `interpreter.rs:2623-2853` |
| Index-eligible predicate (param) | `Predicate::eq_param(...)` after `n_with_label` | `{"Where": {"Compare": {...}}}` after `NWhere(Eq("$label",...))` | `interpreter.rs:2928-2944` |
| Tenant-scoped vector | `vector_search_nodes_with(L, P, qv, k, Some(t))` | `"tenant_value": <PropertyInput>` | `interpreter.rs:5222, 6030` |
| Project distance pre-traversal | `project(vec![..., PropertyProjection::renamed("$distance","distance")])` then traverse | `Project` before `Out`/`In`/`Both` | `interpreter.rs:1407, 6753` |
| OrderBy via range index | `order_by(prop, Order::Desc).limit(n)` with range index on `(L, prop)` | `OrderBy` + `Limit` with range index | `interpreter.rs:829-863, 7061-7091` |
| Bounded repeat | `RepeatConfig::new(sub).max_depth(n)` | `"max_depth": n` | `interpreter.rs:9291` |
| Coalesce cheap-first | branches in cost order | `Coalesce` array elements ordered cheapest-first | `interpreter.rs:7593-7610` |
| Multigraph-safe edge drop | `drop_edge_by_id(EdgeRef)` | `{"DropEdgeById": {...}}` | `interpreter.rs:9136-9149` |
| Read-only warming | `X-Helix-Warm: true` header on read | same | `204` on success |
