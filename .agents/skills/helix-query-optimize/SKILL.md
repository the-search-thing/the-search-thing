---
name: helix-query-optimize
description: Review and improve HelixDB query performance against the actual interpreter behavior — index push-down, label scope, distance lifecycle, limit/dedup pushdown, range-index ordering, repeat/branching cost, and write-path foot-guns. Use when the task is to optimize a slow Helix query, decide why a query is doing a full scan, fix a missed index, tighten BM25 or vector search scope, slim projections, or decide between stored and dynamic routes. See REFERENCE.md for the mechanism catalog with file:line citations and EXAMPLES.md for paired Rust DSL + JSON dynamic patterns.
license: MIT
metadata:
  author: HelixDB
  version: 0.2.0
---

# Helix Query Optimization

Optimize Helix queries by aligning their shape with what the Helix interpreter actually does at each step. Every rule in this skill is grounded in the source — see `REFERENCE.md` for the mechanism and the file:line cite, and `EXAMPLES.md` for paired Rust DSL + JSON forms.

## When To Use

Use this skill when the task is to:

- understand why a Helix query is slow
- review a query for missed index push-down or accidental full scans
- decide if a `where_(...)` or `has(...)` is filtering at the index or in memory
- tighten BM25 or vector search routes (tenant scope, distance lifecycle, projection)
- bound `Repeat` traversals or order `Coalesce` branches by cost
- decide whether a dynamic route should become a stored route
- audit write-path safety (`drop_edge` vs `drop_edge_by_id`, `add_n` dupes, `for_each_param` cost)

## Reference Files

- `REFERENCE.md` — full optimizer mental model: index types, source dispatch table, predicate-index resolution catalog, `RuntimeState` transitions, limit/dedup pushdown, OrderBy paths, projection rules, repeat/branching cost, batch semantics, write-path mechanics, dynamic vs stored cost. Every claim cites `enterprise/helix/src/traversal/interpreter.rs` (helix-hyperscale) or `sdks/rust/src/dsl.rs` (the `helix-db` DSL crate).
- `EXAMPLES.md` — paired Rust DSL + JSON dynamic patterns for every optimization rule below: weaker form, stronger form, what changed and why.

When the JSON encoding rules are not obvious, cross-reference `../helix-query-json-dynamic/REFERENCE.md` (it is the authoritative AST encoding catalog).

## First Steps

Before suggesting any change:

1. **Read the query** and identify the source step (the first AST step). Is it `N(Ids)`, `N(Var)`, `N(Param)`, `NWhere`, `E*`, `VectorSearchNodes`, `TextSearchNodes`?
2. **Identify the effective label scope.** `n_with_label("X")` desugars to `n_where(SourcePredicate::Eq("$label", "X"))` (`sdks/rust/src/dsl.rs:3221`). Without an effective label scope, scoped equality/range indexes are not consulted (`interpreter.rs:2707, 2794, 2832`).
3. **List the predicates and ask: are they `SourcePredicate`-eligible?** Only `SourcePredicate` (Eq, Neq, Gt, Gte, Lt, Lte, Between, HasKey, StartsWith, And, Or — `sdks/rust/src/dsl.rs:1619`) reaches the index dispatcher when used as a source. The full `Predicate` enum has more variants but most are not index-eligible.
4. **Check which indexes exist** in the application — equality, range, node-label, vector (HNSW), text (BM25), and tenant-scoped vector/text. The interpreter never warns on a missed index — it silently falls back.
5. **Decide whether the route is read or write.** Writes use `request_type: "write"` on the dynamic route; warming is read-only.

Do not suggest optimizations before you understand the anchor, the label scope, and the index inventory.

## The Seven Levers

### 1. Anchor on an index-eligible predicate

**Why it matters.** The index dispatcher (`try_resolve_predicate_from_indexes`, `interpreter.rs:2610-2948`) only recognizes a fixed set of predicate shapes: `Eq`, `Gt/Gte/Lt/Lte`, `Between`, `IsIn`, `IsInExpr`, `HasKey`, `StartsWith`, `And` (recurses), `Or` (requires every child indexable), and `Compare` when its right-side param resolves to a literal (`interpreter.rs:2928-2944`). Everything else falls through to `_ => Ok(None)` at `interpreter.rs:2946` and the caller scans at `interpreter.rs:5966` (`vertices_where(...)`).

`SourcePredicate::eq(prop, value)` takes a literal `PropertyValue` (compile-time known). For runtime parameters, the DSL builds `where_(Predicate::eq_param(prop, name))` which compiles to `Predicate::Compare { left: Property(prop), op: Eq, right: Param(name) }`. The dispatcher does index-resolve `Compare` (path 2928-2944), so a parameterized `where_` after a labeled source is still on the fast path **as long as the label scope is set** — see lever 2.

**Fix.** Use `SourcePredicate::eq` / `between` / `gt` / `is_in` for literal predicates inside `n_with_label_where` / `n_where`. Use `where_(Predicate::eq_param(...))` for parameterized predicates, anchored on `n_with_label("X")` so the dispatcher has a label scope. Avoid index-blind predicates at any position: `Contains`, `EndsWith`, `Not`, `IsNull`, `IsNotNull`, and any `Or` mixing index-eligible and non-eligible arms — these always force load-then-filter (REFERENCE.md §4). See `EXAMPLES.md §2`.

### 2. Provide a label scope

**Why it matters.** Scoped equality indexes are keyed by `scoped_secondary_index_property(label, property)` (`interpreter.rs:2601, 2709, 2795, 2831`). Without an `effective_label_scope` (either set explicitly via `n_with_label*` or derived from a `SourcePredicate::Eq("$label", ...)` at `interpreter.rs:2620-2621`), those gates short-circuit and the predicate is not index-resolvable — even if `(Label, Property)` is indexed.

`HasKey("$label")` and `StartsWith("$label", ...)` have a node-label-index fast path (`interpreter.rs:2782, 2819`); other predicates do not.

**Fix.** Always anchor with a label. Prefer `n_with_label_where("User", SourcePredicate::eq("userId", id))` over `n_where(SourcePredicate::eq("userId", id))`. The DSL convenience function `n_with_label_where` builds an `And([Eq("$label", L), pred])` for you (`sdks/rust/src/dsl.rs:3233`).

### 3. Match the index kind to the predicate

**Why it matters.** The dispatcher uses a different index for each predicate kind (`REFERENCE.md §Predicate-index resolution`):

- `Eq` → equality index (`interpreter.rs:2623`)
- `Gt/Gte/Lt/Lte` → range index (`interpreter.rs:2638-2700`)
- `Between` → range index only (`interpreter.rs:2702-2722`); falls back if only equality index exists
- `IsIn` / `IsInExpr` → union of equality lookups (`interpreter.rs:2723-2780`); needs equality index
- `HasKey` → equality property prefix scan (`interpreter.rs:2781`)
- `StartsWith` → range index preferred, equality prefix as fallback (`interpreter.rs:2818-2853`); returns `Candidates` (verification after)

Predicates that are **never** index-eligible (always full scan + post-filter): `Contains`, `EndsWith`, `Not`, `IsNull`, `IsNotNull`, `Or` of mixed kinds, `Compare` with non-resolvable param. Source-position `Or`/`And` recurse, so each child still needs an index.

**Fix.** Match the index to the predicate. If you need range queries, create a range index (`IndexSpec::node_range`) — equality indexes don't satisfy `Between`. If you need substring search, use BM25 (`text_search_nodes_with`) — `Predicate::Contains` will scan.

### 4. Pass `tenant_value` for tenant-scoped vector/text

**Why it matters.** Vector and text indexes can be created with a `tenant_property` (`IndexSpec::node_vector(label, property, tenant_property)`). The interpreter resolves the index name via `resolve_vector_search_index_name` (`interpreter.rs:5222`); if the index has a tenant property and `tenant_value` is `None`, it errors at `interpreter.rs:5234-5237` or — when the resolved index is missing — silently catches `IndexNotFound` and returns `Vec::new()` (`interpreter.rs:6048-6052`). A tenant index plus a `where_("tenant_id", ...)` post-filter is wrong: the post-filter cannot widen a search that was scoped to the wrong tenant, and it cannot narrow a search that was unscoped (because k-NN/BM25 already returned the top-k from the wrong/global pool).

**Fix.** Always pass `Some(PropertyInput::param("tenantId"))` (or a literal `Some(PropertyInput::value(...))`) as the last argument to `vector_search_nodes_with` / `text_search_nodes_with`. Verify the tenant-scoped index actually exists before relying on the path.

### 5. Project before traversing off the hit stream

**Why it matters.** Vector and text search produce `RuntimeState::RankedVertices { vertices, hits }` / `RankedEdges { edges, hits }` (`interpreter.rs:1359-1404`). Each hit carries `distance`/`score`. As soon as a step calls `as_vertices()` (`interpreter.rs:1407-1411`) the hits are dropped. Steps that drop ranking metadata: `Out`, `In`, `Both`, `OutN`, `InN`, `OtherN` (post `Out/In/Both` at `interpreter.rs:6753-6795`), `Where` and `OrderBy` transitions that produce plain `Vertices`/`OrderedVertices` (`interpreter.rs:7054, 7088`).

Steps that **preserve** ranking: `As`, `Store`, `Select`, plus terminal projections (`value_map`, `project`, `values`, `edge_properties`) which read `distance`/`score` from state via the virtual fields `$distance` and `$score`.

**Fix.** Project before traversing. If you need both the distance and the post-traversal node, store the hit ids first: `vector_search_nodes_with(...).as_("hits").project(vec![..., PropertyProjection::renamed("$distance", "distance")])`, then in a separate variable do the traversal.

### 6. Pair `Limit` with `Dedup` (and `OrderBy` with a range index)

**Why it matters.** The interpreter peeks one step ahead via `consume_limit_after` (`interpreter.rs:787-827`) to detect `step → Limit/Range/LimitBy/RangeBy` and `step → Dedup → Limit` patterns; when matched it sets `LimitPushdown { limit, dedup }` and threads it into source/traversal collection (`collect_set_limited`). Without that exact lookahead, the interpreter materializes the full result set then trims. Limit pushdown is **disabled** for edge-side filters (`EWhere`, `EdgeHas`, `EdgeHasLabel` — `interpreter.rs:807-812`).

`OrderBy` over a property with a scoped range index uses `order_by_from_range_index` (`interpreter.rs:829-863`) — a prefix scan in key order, no in-memory sort. Without a range index, `OrderBy` loads all properties, sorts in memory (`interpreter.rs:7061-7091`).

**Fix.** Put `Limit`/`Range` directly after the source or traversal step you want bounded — not after a chain of filters. When ordering, ensure a range index exists for that property if the result set is large; otherwise expect a full materialize+sort. Deep pagination (`skip(100000).limit(10)`) still requires reading and discarding the first 100,000 — design around it (cursor-by-property with `Gt(prop, last_value)`).

### 7. Bound `Repeat` and order `Coalesce` by cost

**Why it matters.** `Step::Repeat` enforces `max_depth` only when set (`interpreter.rs:9291`); a missing `max_depth` plus an `until` predicate that never matches loops until OOM. `Step::Coalesce` evaluates each branch in order until the first non-empty result (`interpreter.rs:7593-7610`); branches before the first hit are *always* evaluated. `Step::Choose` runs both arms unless the condition partitions the input. `Step::Optional` always runs its body (the absence of results is the "optional" semantics, not skipping work).

**Fix.** Always set `max_depth` (e.g., `RepeatConfig::new(sub).times(5).max_depth(10)`). Order `Coalesce` branches by ascending cost — the cheapest probe first, the expensive fallback last. Avoid `Optional` for expensive arms; use `var_as_if(BatchCondition::VarEmpty(...), ...)` at the batch level instead.

## Read-vs-Write Foot-Guns

Stored writes and dynamic writes share the same anti-patterns (write detection lives in `request_type` for the dynamic route; the interpreter executes the same Steps either way).

- **`add_n` without an existence check creates duplicates.** Every `Step::AddN` allocates a fresh node id (`interpreter.rs:8954-8967`). Build upserts as `var_as("existing", ...) → var_as_if(VarNotEmpty, set_property...) → var_as_if(VarEmpty, add_n...)`. See `EXAMPLES.md §9`.
- **`drop_edge(to)` is multigraph-unsafe.** It calls `tx.remove_edge(from, to)` which removes *all* edges between source and target, regardless of label (`interpreter.rs:9095`). Use `drop_edge_labeled(to, label)` to scope by label, or `drop_edge_by_id(EdgeRef::Ids([...]))` for surgical deletion (`interpreter.rs:9136-9149`).
- **`set_property` on missing nodes is a silent no-op.** If the traversal yields ids that don't exist, the property write is skipped. Validate with `var_as("target", ...)` then `var_as_if(VarNotEmpty("target"), ...)`.
- **`for_each_param` over a large array is O(rows × body cost).** Each iteration runs the body fresh; there's no batched merge. For bulk inserts, prefer building one `WriteBatch` per request when the cardinality is bounded, or break into pages.
- **Upsert lookups need an index.** The "load existing" step in an upsert (`var_as("existing", g().n_with_label_where(L, SourcePredicate::eq("uniqueId", param)))`) must hit an equality index — otherwise every upsert is a full scan.

## Stored vs Dynamic, and Warming

- **Prefer stored routes for steady traffic.** Stored routes register via the `#[register]` macro (helix-dsl-macros) and avoid per-request JSON parse / AST validation. Dynamic routes are right for ad-hoc queries, admin tools, and tests.
- **Query warming is read-only.** Send the same body with header `X-Helix-Warm: true`; the gateway returns `204 No Content` on success. Writes with the warm header are rejected.
- **No `"mcp"` request_type on the dynamic route.** That value belongs to the stored-route MCP surface only.

## Anti-Patterns

Do not:

- start a query with a non-`SourcePredicate` predicate at the source (it becomes a full scan + post-filter; `REFERENCE.md §Predicate-index resolution`)
- omit a label when filtering on a property — scoped indexes won't be consulted (`interpreter.rs:2707, 2794`)
- use `Predicate::eq_param` at the source position when you have a known label and an indexed property — prefer `SourcePredicate::eq` inside `n_with_label_where`
- omit `tenant_value` on tenant-scoped vector/text search
- traverse off the hit stream (`out`/`in_`/`both`) before projecting `$distance` / `$score`
- expect `OrderBy` to be cheap without a range index
- write `Repeat` without `max_depth`
- order `Coalesce` branches by intuition rather than cost
- use `value_map(None)` on nodes that store embeddings or other large fields
- use `drop_edge(to)` on a multigraph
- run `for_each_param` over an unbounded array
- default to dynamic queries for stable production traffic

## Validation Checklist

Before finishing a review:

- [ ] the source step is the narrowest practical indexed set (id > unique property > equality-indexed property > scoped label scan > broad scan)
- [ ] every property predicate is in an index-eligible shape (`Eq`, `Gt/Gte/Lt/Lte`, `Between`, `IsIn`, `HasKey`, `StartsWith`, `And` over those, or `Compare` resolving to one of them)
- [ ] every property predicate has a matching index (equality / range / vector / text)
- [ ] every property predicate has an effective label scope (explicit `n_with_label*` or `$label`-derived)
- [ ] runtime-parameter predicates use `where_(Predicate::eq_param(...))` after `n_with_label*` (not unanchored `n_where`)
- [ ] tenant-scoped vector/text routes pass `tenant_value`
- [ ] BM25 and vector routes preserve scope (no post-filter scoping that defeats the index)
- [ ] `$distance` / `$score` are projected before any `Out`/`In`/`Both`/`OrderBy` step
- [ ] `Limit` is paired with the step it should bound (no chain of filters in between)
- [ ] `OrderBy` has a backing range index, or the cost is acceptable
- [ ] `Repeat` has a `max_depth` and a sane `until`
- [ ] `Coalesce` branches are cheapest-first
- [ ] `value_map(None)` is not used on nodes that hold heavy properties
- [ ] writes use `drop_edge_by_id` on multigraphs
- [ ] upsert lookups hit an indexed property
- [ ] stable production traffic uses stored routes; warming is read-only
