---
name: helix-query-from-cypher
description: Translate Cypher and Neo4j-style queries into HelixDB Rust DSL stored queries. Use when the input contains Cypher, Neo4j, MATCH, OPTIONAL MATCH, WHERE, RETURN, ORDER BY, LIMIT, DISTINCT, MERGE, CASE, UNWIND, FOREACH, DETACH DELETE, IS NULL, or variable-length path patterns and the goal is to produce an equivalent Helix Rust query.
license: MIT
metadata:
  author: HelixDB
  version: 0.1.0
---

# Cypher To Helix Queries

Translate Cypher into Helix Rust DSL by mapping patterns into explicit anchors, traversals, predicates, and return shaping.

## When To Use

Use this skill when the task is to:

- translate a Cypher query into Helix Rust DSL
- port a Neo4j query into a stored Helix route
- replace `MATCH`, `OPTIONAL MATCH`, `WHERE`, `RETURN`, `DISTINCT`, `ORDER BY`, `LIMIT`, `MERGE`, `CASE`, `UNWIND`, `FOREACH`, or `DETACH DELETE` with Helix DSL equivalents
- explain how a Cypher graph pattern should be expressed in Helix Rust

Do not use this skill as the main guide for Gremlin, SQL, or dynamic inline-query JSON.

## First Steps

Before translating:

1. Inspect the local repo for real labels, edge labels, property names, and route style.
2. Parse the Cypher into anchors, edge directions, hop depth, filters, return shape, ordering, and pagination.
3. Decide whether the target route is read or write.
4. Identify optional branches, per-element writes, null or existence checks, and timestamp usage.
5. Identify any Cypher constructs that need semantic rather than literal translation.

If the local repo does not already contain an obvious Helix pattern, use:

1. `docs/cypher-rosetta.md`
2. `docs/dsl-cheatsheet.md`
3. `examples/authoring-patterns.md`
4. `examples/search-patterns.md`

## Translation Workflow

### 1. Choose The First Anchor

Translate the first practical Cypher node pattern into the narrowest Helix anchor you can justify.

Prefer:

1. node ID or edge ID
2. unique property lookup
3. equality-indexed property lookup
4. scoped label scan
5. broad label scan

### 2. Translate Edge Direction Explicitly

Cypher pattern direction should map directly:

- `()-[:REL]->()` to `out(Some("REL"))`
- `()<-[:REL]-()` to `in_(Some("REL"))`
- `()-[e:REL]->()` to `out_e(Some("REL"))`
- undirected or symmetric traversal usually to `both(Some("REL"))` or `both_e(Some("REL"))` when the schema and task justify it

### 3. Translate WHERE Into Predicates

Typical mappings:

- equality to `Predicate::eq_param`
- numeric comparisons to `Predicate::gt_param`, `gte_param`, `lt_param`, `lte_param`
- membership to `Predicate::is_in_param`
- null checks to `Predicate::is_null`
- property-existence checks to `Predicate::has_key`
- compound logic to `Predicate::and(vec![...])` and `Predicate::or(vec![...])`

### 4. Translate RETURN Into Explicit Output Shaping

Use:

- `project(...)` for intentional fields
- `value_map(...)` when a looser property map is acceptable
- `count()` for counts
- `dedup()` for `DISTINCT`
- `order_by`, `skip`, `limit`, and `range` for result ordering and pagination

### 5. Handle Non-1:1 Cypher Features Carefully

Do not force literal translations for:

- `MERGE`
- path-returning queries
- `RETURN *`

Translate them semantically instead.

## Key Cypher Rules

### MATCH

`MATCH` usually becomes one or more `var_as(...)` bindings plus explicit traversal steps.

### WHERE

`WHERE` becomes explicit predicate calls. Keep parameter names aligned with the user's query or local route conventions.

### RETURN

`RETURN` should become a deliberate Helix result shape, not an implicit full-object dump unless the route truly wants that.

### DISTINCT

Use `dedup()` before shaping or returning results.

### MERGE

There is no single drop-in `MERGE` translation pattern in this skill. Use explicit read-first branching with `var_as_if`.

### OPTIONAL MATCH

Use `.optional(sub(...))` when a related traversal should not eliminate the root path just because the optional branch has no match.

### CASE WHEN

Use `.choose(...)` for traversal-level if/then/else logic.

### UNWIND And FOREACH

Use `for_each_param(...)` when a write route needs to iterate an array parameter and perform graph work per element.

### Multi-Hop Patterns

Use bounded `repeat(RepeatConfig::new(...).times(N).emit_after())` for Cypher patterns like `[:REL*1..N]`.

### IS NULL And Property Existence

Use `Predicate::is_null` for null-style checks and `Predicate::has_key` when the query is really testing whether the property exists.

### Server-Side Timestamps

Use the server-side timestamp helper from your current Helix build when translating Cypher `timestamp()` usage.

## Canonical Example

Cypher:

```cypher
MATCH (u:User {userId: $userId})-[:FOLLOWS]->(v:User)
WHERE v.status = $status
RETURN v
ORDER BY v.createdAt DESC
LIMIT $limit
```

Helix Rust DSL:

```rust
read_batch()
    .var_as(
        "user",
        g().n_with_label("User")
            .where_(Predicate::eq_param("userId", "userId")),
    )
    .var_as(
        "results",
        g().n(NodeRef::var("user"))
            .out(Some("FOLLOWS"))
            .where_(Predicate::eq_param("status", "status"))
            .order_by("createdAt", Order::Desc)
            .limit(Expr::param("limit"))
            .project(vec![
                PropertyProjection::new("$id"),
                PropertyProjection::new("userId"),
                PropertyProjection::new("name"),
                PropertyProjection::new("status"),
                PropertyProjection::new("createdAt"),
            ]),
    )
    .returning(["results"])
```

## Anti-Patterns

Do not:

- translate Cypher by string substitution alone
- ignore edge direction
- preserve Cypher variable names if they conflict with the local Helix route style and make the translation worse
- assume every Cypher clause is a single-token replacement in Helix
- return every property by default just because the Cypher query returned a node variable
- invent labels, properties, or edge names instead of reading the target schema

## Validation Checklist

Before finishing:

- verify the first anchor is correct and narrow enough
- verify edge directions are translated correctly
- verify `WHERE` clauses became explicit `Predicate` logic
- verify optional traversals use `optional(sub(...))` when required
- verify multi-hop traversal uses bounded `repeat(...)` with explicit emission behavior
- verify `RETURN` became an intentional Helix output shape
- verify `DISTINCT`, `ORDER BY`, `SKIP`, and `LIMIT` were mapped deliberately
- verify `CASE`, `UNWIND`, `FOREACH`, delete, and timestamp logic were translated to Helix-native constructs when present
- verify `MERGE` was translated semantically, not literally
- verify labels, edge labels, and properties match the local repo exactly

## Repo References

For shared references in this repo, see:

- `docs/cypher-rosetta.md`
- `docs/dsl-cheatsheet.md`
- `examples/authoring-patterns.md`
- `examples/search-patterns.md`

## Related Skills

- `helix-query-rust` — full Rust DSL builder catalog and authoring rules; use it to validate the query you produce.
- `helix-query-typescript` — the TypeScript DSL emits the same JSON AST, if the target is TypeScript rather than Rust.
- `helix-query-json-dynamic` — the inline JSON form of the same query.
