---
name: helix-query-from-gremlin
description: Translate Gremlin and TinkerPop-style traversals into HelixDB Rust DSL stored queries. Use when the input contains Gremlin, TinkerPop, g.V, g.E, hasLabel, has, out, in, both, outE, inE, repeat, emit, dedup, valueMap, count, range, or limit and the goal is to produce an equivalent Helix Rust query.
license: MIT
metadata:
  author: HelixDB
  version: 0.1.0
---

# Gremlin To Helix Queries

Translate Gremlin into Helix Rust DSL by turning imperative step chains into explicit anchors, traversals, predicates, and result shaping.

## When To Use

Use this skill when the task is to:

- translate a Gremlin traversal into Helix Rust DSL
- port a TinkerPop query into a stored Helix route
- replace `g.V`, `hasLabel`, `has`, `out`, `in`, `both`, `outE`, `inE`, `repeat`, `emit`, `dedup`, `count`, `range`, or `limit` with Helix DSL equivalents
- explain how a Gremlin traversal should be expressed in Helix Rust

Do not use this skill as the main guide for Cypher, SQL, or dynamic inline-query JSON.

## First Steps

Before translating:

1. Inspect the local repo for real labels, edge labels, property names, and route style.
2. Parse the Gremlin traversal into its start step, filters, directional steps, repeat logic, and result shaping.
3. Decide whether the target route is read or write.
4. Identify any Gremlin constructs that are not a direct one-to-one translation.

If the local repo does not already contain an obvious Helix pattern, use:

1. `docs/gremlin-rosetta.md`
2. `docs/dsl-cheatsheet.md`
3. `examples/authoring-patterns.md`
4. `examples/search-patterns.md`

## Translation Workflow

### 1. Choose The Start Step Carefully

Translate the first Gremlin step into the narrowest Helix anchor you can justify.

Prefer:

1. node ID or edge ID
2. unique property lookup
3. equality-indexed property lookup
4. scoped label scan
5. broad label scan

Do not keep a broad `g.V()` or `g.E()` shape if the traversal can start narrower.

### 2. Translate Each Directional Step Explicitly

Typical mappings:

- `.out("REL")` to `.out(Some("REL"))`
- `.in("REL")` to `.in_(Some("REL"))`
- `.both("REL")` to `.both(Some("REL"))`
- `.outE("REL")` to `.out_e(Some("REL"))`
- `.inE("REL")` to `.in_e(Some("REL"))`

### 3. Translate `hasLabel` And `has` Into Label And Predicate Logic

Typical mappings:

- `hasLabel("User")` to `n_with_label("User")`
- `has("status", status)` to `where_(Predicate::eq_param("status", "status"))`
- `has("status", within(statuses))` to `where_(Predicate::is_in_param("status", "statuses"))`

### 4. Translate Result-Shaping Steps Deliberately

Use:

- `dedup()` for Gremlin `dedup()`
- `count()` for Gremlin `count()`
- `order_by` or `order_by_multiple` for Gremlin ordering
- `limit`, `skip`, and `range` for result-window control
- `project(...)` or `value_map(...)` for output shape

### 5. Treat Complex Gremlin Features As Semantic Translations

Do not force literal translations for:

- `path()`
- `select(...)`
- `project(...)` in Gremlin's map-building sense
- `coalesce(...)`
- `choose(...)`
- `union(...)`
- `group()` and `groupCount()`
- `sideEffect(...)`
- `sack(...)`
- open-ended repeat logic

Translate them semantically instead.

## Key Gremlin Rules

### `g.V` And `g.E`

Use the narrowest anchor possible. For bare `g.E()`, prefer rewriting to a node-anchored edge traversal or an edge-ID anchor rather than an all-edge scan.

### `valueMap` And `values`

Gremlin often emits map or scalar streams. Helix service routes usually work better with explicit object-shaped projections.

Use `value_map(...)` when a property map is acceptable, and use `project(...)` when the route should return a stable shape.

### `repeat` And `emit`

Use bounded `repeat(...)` with an explicit `.times(...)` limit. Do not assume arbitrary unbounded traversal semantics.

## Canonical Example

Gremlin:

```gremlin
g.V().hasLabel('User').has('userId', userId).out('FOLLOWS').has('status', status).order().by('createdAt', desc).limit(limit).valueMap('userId', 'name', 'status', 'createdAt')
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
            .value_map(Some(vec!["userId", "name", "status", "createdAt"])),
    )
    .returning(["results"])
```

## Anti-Patterns

Do not:

- translate Gremlin step chains by string substitution alone
- preserve a broad `g.V()` or `g.E()` when a narrower anchor exists
- ignore edge direction
- assume `valueMap`, `path`, `select`, or `project` has a one-step literal Helix equivalent
- translate open-ended repeat logic without setting an explicit bound
- invent labels, properties, or edge names instead of reading the target schema

## Validation Checklist

Before finishing:

- verify the start step became the narrowest practical Helix anchor
- verify edge directions are translated correctly
- verify `hasLabel` and `has` became explicit label and predicate logic
- verify `dedup`, `count`, `limit`, `range`, and ordering were mapped deliberately
- verify `valueMap` or `values` became an intentional Helix output shape
- verify `repeat` was translated with an explicit bound
- verify complex Gremlin features were translated semantically, not literally
- verify labels, edge labels, and properties match the local repo exactly

## Repo References

For shared references in this repo, see:

- `docs/gremlin-rosetta.md`
- `docs/dsl-cheatsheet.md`
- `examples/authoring-patterns.md`
- `examples/search-patterns.md`

## Related Skills

- `helix-query-rust` — full Rust DSL builder catalog and authoring rules; use it to validate the query you produce.
- `helix-query-typescript` — the TypeScript DSL emits the same JSON AST, if the target is TypeScript rather than Rust.
- `helix-query-json-dynamic` — the inline JSON form of the same query.
