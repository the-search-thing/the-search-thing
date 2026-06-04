---
name: helix-query-rust
description: Write and revise HelixDB Rust DSL queries from scratch. Use when the task is to add, update, or review a Helix query built in Rust with read_batch, write_batch, traversal builders, projections, indexes, BM25 text search, or vector search — and for stored-query bundles or #[register] dynamic requests. Inspect local labels, edges, properties, and existing query patterns before inventing new code. See REFERENCE.md for the full builder catalog and EXAMPLES.md for end-to-end patterns. For the TypeScript DSL use helix-query-typescript; for inline JSON use helix-query-json-dynamic.
license: MIT
metadata:
  author: HelixDB
  version: 0.3.0
---

# Helix Query Authoring — Rust

Write Helix Rust DSL queries in a way that is schema-aware, explicit, and easy for agents to reason about. The Rust builder is the `helix-db` crate (`sdks/rust`); the TypeScript DSL (`helix-query-typescript`) emits the same JSON AST.

This is the preferred way to author Helix queries in a Rust codebase. Drop to raw dynamic JSON (`helix-query-json-dynamic`) only for debugging or dynamically-shaped requests.

## When To Use

Use this skill when the task is to:

- write a new Helix query in Rust
- revise an existing Helix Rust DSL route
- add a stored query for deployment
- choose between `read_batch()` and `write_batch()`
- add traversal, projection, pagination, BM25 search, or vector search to an existing query

Do not use this skill as the main guide for inline `POST /v1/query` payloads — use `helix-query-json-dynamic`. For the TypeScript DSL, use `helix-query-typescript`.

## First Steps

Before writing any query code:

1. Inspect the local repo for existing labels, edge labels, properties, and route patterns.
2. Find the closest existing query and reuse its naming, projection, and scoping style.
3. Decide whether the route is a read or a write.
4. Identify the narrowest indexed anchor before planning the traversal.

If the local repo is thin on Helix examples, use the companion files in this skill:

1. `EXAMPLES.md` — working end-to-end Rust queries (reads, writes, search, repeat, branching, upsert, `for_each_param`).
2. `REFERENCE.md` — full builder catalog organized by category, with typestate notes.

Open `REFERENCE.md` whenever you need a builder beyond the common surface (`add_e`, `drop_edge_by_id`, `create_vector_index_nodes`, `repeat`, `choose`, `coalesce`, `optional`, `aggregate_by`, `group_count`, `inject`, `order_by_multiple`, expression `case`, etc.) — do not invent method names from memory.

## Core Authoring Rules

### 1. Start With The Right Batch Type

Use:

- `read_batch()` for read-only routes
- `write_batch()` for any mutation

If the query adds nodes, adds edges, updates properties, or deletes graph data, it is a write route.

### 2. Anchor Narrow, Then Traverse

Prefer this anchor order:

1. node ID or edge ID
2. unique property lookup
3. equality-indexed property lookup
4. scoped label scan
5. broad label scan as a last resort

Do not start from a broad label scan when the application already has an indexed identifier like `entityId`, `externalId`, `userId`, `tenantId`, or a similar key.

### 3. Reuse Existing Property And Label Casing

Do not normalize names to your own preferred style.

If the application uses `entityId`, `updatedAt`, `FOLLOWS`, or `RelatesTo`, reuse those exact names.

### 4. Filter Early

Apply scope and status filters before broad traversal whenever possible.

Common examples:

- tenant filters like `tenantId` or `userId`
- soft-delete or archived filters such as empty or null `deletedAt`
- specific ID filters before `both`, `out`, or `in_`

### 5. Keep Output Shape Intentional

Use:

- `project(...)` for stable service-facing response shapes
- `value_map(...)` when returning all or many properties is acceptable
- `edge_properties()` for edge streams

Do not return oversized properties like embeddings unless the caller explicitly needs them.

### 6. Preserve Search Scope

For BM25 and vector search:

- keep the chosen text or vector property explicit
- preserve tenant scope when the index is scoped
- post-filter only when the search API cannot express the scope directly

### 7. Use Traversal Controls Deliberately

Apply `dedup`, `limit`, `range`, `skip`, `count`, and `first` because the route needs them, not by habit.

`repeat(...)` is often used with a deliberate bounded depth. Do not assume arbitrary runtime repeat depth unless the local code already supports it.

### 8. Prefer Explicit Write Branching Over Invented MERGE Semantics

When you need create-or-update behavior, follow this pattern:

1. load existing nodes
2. branch with `var_as_if`
3. update when found
4. create when missing

### 9. Know The Full Builder Surface

The DSL is larger than the canonical examples below suggest. Before reaching for a workaround, check `REFERENCE.md` — there is likely a direct builder.

| Category | Primary builders | Notes |
|---|---|---|
| Sources | `g().n(...)`, `n_where`, `n_with_label`, `n_with_label_where`, `e`, `e_where`, `e_with_label`, `e_with_label_where`, `vector_search_nodes_with`, `text_search_nodes_with`, `vector_search_edges_with`, `text_search_edges_with` | Anchor narrowly — indexed ID first, then label scope. |
| Traversal | `out`, `in_`, `both`, `out_e`, `in_e`, `both_e`, `out_n`, `in_n`, `other_n` | Edge-valued forms (`*_e`) switch the stream type. |
| Filters | `has`, `has_label`, `has_key`, `where_`, `dedup`, `within`, `without`, `edge_has`, `edge_has_label` | `Predicate::*` + `Predicate::*_param` for parameterized comparisons. |
| Limits | `limit`, `skip`, `range` | All accept `usize` or `Expr`. |
| Variables | `as_` / `store`, `select`, `inject` | Cross-query refs via `NodeRef::var`, `EdgeRef::var`, `NodeRef::param`, `EdgeRef::param`. |
| Ordering | `order_by`, `order_by_multiple` | Use `Order::Desc` for descending. |
| Aggregation | `count`, `exists`, `group`, `group_count`, `aggregate_by` | `AggregateFunction::{Count,Sum,Min,Max,Mean}`. |
| Branching | `union`, `choose`, `coalesce`, `optional` | Each arm is a `sub()` sub-traversal. |
| Repeat | `repeat(RepeatConfig::new(sub).times(n).until(pred).emit_all().max_depth(100))` | Always bound with `times` or `until`; default `max_depth` is 100. |
| Projection | `values`, `value_map`, `project`, `edge_properties` | `project` mixes `PropertyProjection` (incl. renames) and `ExprProjection`. |
| Expressions | `Expr::prop`, `Expr::val`, `Expr::id`, `Expr::timestamp`, `Expr::datetime`, `Expr::param`, `.add/.sub/.mul/.div/.modulo/.neg`, `Expr::case` | `Expr::Timestamp` writes server UTC millis; `Expr::DateTimeNow` writes typed datetime. |
| Mutations | `add_n`, `add_e`, `set_property`, `remove_property`, `drop`, `drop_edge`, `drop_edge_labeled`, `drop_edge_by_id` | `drop_edge_by_id` is multigraph-safe. |
| Indexes | `IndexSpec::node_equality / node_range / edge_equality / edge_range / node_vector / node_text / edge_vector / edge_text` plus `create_index` / `drop_index`; convenience: `create_vector_index_nodes`, `create_text_index_nodes`, edge variants | Use `.create_index(spec)` from a write batch. |
| Transport | `DynamicQueryRequest::{read,write}(batch).with_parameter_value(...).with_parameter_type(...).to_json_string()` | Bridge from Rust DSL to the JSON payload (`helix-query-json-dynamic`). |

See `REFERENCE.md` for signatures and typestate constraints.

## Canonical Examples

### Read By Indexed Identifier

```rust
read_batch()
    .var_as(
        "user",
        g().n_with_label("User")
            .where_(Predicate::eq_param("userId", "userId"))
            .project(vec![
                PropertyProjection::new("$id"),
                PropertyProjection::new("userId"),
                PropertyProjection::new("name"),
            ]),
    )
    .returning(["user"])
```

### Explicit Create Or Update

```rust
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
```

### Scoped Search Route

```rust
read_batch()
    .var_as(
        "results",
        g().vector_search_nodes_with(
            "Document",
            "embedding",
            PropertyInput::param("queryVector"),
            Expr::param("limit"),
            Some(PropertyInput::param("tenantId")),
        )
        .project(vec![
            PropertyProjection::new("$id"),
            PropertyProjection::new("title"),
            PropertyProjection::renamed("$distance", "distance"),
        ]),
    )
    .returning(["results"])
```

## Anti-Patterns

Do not:

- invent labels, edge labels, or property names without checking the codebase
- start from broad scans when an indexed ID or scoped predicate exists
- return embeddings by default in search results
- ignore tenant scope on text or vector search
- add `dedup` or `limit` without a reason
- assume dynamic inline-query rules apply to stored Rust DSL routes
- treat BM25 as if it searches every property automatically

## Validation Checklist

Before finishing:

- verify `read_batch()` versus `write_batch()` is correct
- verify labels, edge labels, and properties match the repo exactly
- verify the first anchor is the narrowest practical indexed set
- verify scope filters happen before or as early as possible
- verify the returned variable names and shape match service expectations
- verify text and vector routes preserve tenant scope when required
- verify large properties are omitted unless needed
- verify the query matches surrounding local style more than any generic example

## Reference Files

- `REFERENCE.md` — full builder catalog (sources, traversal, predicates, expressions, projections, branching, repeat, mutations, indexes, dynamic-request transport).
- `EXAMPLES.md` — end-to-end Rust queries mirroring the scenarios in `../helix-query-typescript/EXAMPLES.md` and `../helix-query-json-dynamic/EXAMPLES.md` 1:1, so you can move fluently between the Rust DSL, TypeScript DSL, and JSON forms.
