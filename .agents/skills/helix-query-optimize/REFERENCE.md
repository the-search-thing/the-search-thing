# Helix Query Optimization — Mechanism Reference

This is the optimizer's mental model: what the Helix interpreter actually does at each step, with file:line citations so any claim can be verified directly.

## Path conventions

- `interpreter.rs:N` — `enterprise/helix/src/traversal/interpreter.rs` in the Helix interpreter repo (helix-hyperscale).
- `dsl.rs:N` — `sdks/rust/src/dsl.rs` in the `helix-db` DSL crate.
- `index/mod.rs:N` — `enterprise/helix/src/db/index/mod.rs`.

Cross-references to JSON encoding land in `../helix-query-json-dynamic/REFERENCE.md`. Cross-references to the DSL builder catalog land in `../helix-query-rust/REFERENCE.md` (Rust) and `../helix-query-typescript/REFERENCE.md` (TypeScript).

---

## 1. Index types

| Index | Key shape | Used for | Created via |
|---|---|---|---|
| Equality (scoped) | `[secondary][label-prefixed property][value-hash]` → roaring set of node ids | `Eq`, `IsIn`, `HasKey`, `StartsWith` (fallback) | `IndexSpec::node_equality(label, prop)` |
| Range (scoped) | `[secondary][label-prefixed property][value][node id]` → presence | `Gt`, `Gte`, `Lt`, `Lte`, `Between`, `StartsWith` (preferred), `OrderBy` | `IndexSpec::node_range(label, prop)` |
| Node-label | global property index on `$label` | `HasKey("$label")`, `StartsWith("$label", _)`, label scans | implicit when `has_node_label_index()` is true (`interpreter.rs:2782, 2819`) |
| Vector (HNSW) | per `(label, prop[, tenant_property])` graph | `VectorSearchNodes`/`Edges` | `IndexSpec::node_vector(label, prop, tenant_property)` |
| Text (BM25) | per `(label, prop[, tenant_property])` Tantivy index | `TextSearchNodes`/`Edges` | `IndexSpec::node_text(label, prop, tenant_property)` |
| Edge equality / range | edge analogues | edge sources | `IndexSpec::edge_equality`, `edge_range` |
| Edge vector / text | edge analogues | edge search | `IndexSpec::edge_vector`, `edge_text` |
| Global edge label index | edge id set per label | source `EWhere(SourcePredicate::Eq("$label", L))` | implicit (`interpreter.rs:5519-5525`) |

Tenant-scoping for vector/text is via the `tenant_property` field on the `IndexSpec` — at search time the runtime resolves a tenant-partitioned index name (`interpreter.rs:5222-5238`). Tenant-scoping for equality/range is via the **label prefix** in `scoped_secondary_index_property(label, property)` — there is no separate tenant axis, the label is the partition key. Multi-tenant equality/range queries should embed the tenant id in the property/label combination at schema time.

There is no explicit "unique" enforcement at the equality-index layer — the DSL exposes a `unique: bool` field on `IndexSpec::NodeEquality` but uniqueness checks happen at write time, not at read time. Read-time equality lookup returns a roaring set regardless of cardinality.

---

## 2. `SourcePredicate` vs `Predicate`

Two distinct enums with different reach.

`SourcePredicate` (`dsl.rs:1619`) — restricted, can appear at the source position (inside `n_where`, `e_where`, `n_with_label_where`, `e_with_label_where`):

```text
Eq, Neq, Gt, Gte, Lt, Lte, Between, HasKey, StartsWith, And, Or
```

`Predicate` (`dsl.rs:1564`) — full, mid-traversal via `where_(...)`:

```text
Eq, Neq, Gt, Gte, Lt, Lte, Between, HasKey, IsNull, IsNotNull,
StartsWith, EndsWith, Contains, ContainsExpr,
IsIn, IsInExpr, And, Or, Not, Compare { left, op, right }
```

The split matters because:

1. The DSL's typestate enforces that `n_where` and friends accept only `SourcePredicate` (`dsl.rs:3213, 3233`). You cannot write `Predicate::Contains` at a source position.
2. The interpreter's source-step path explicitly recognizes the source-predicate label fast path (`SourcePredicate::Eq("$label", X)` → label-bag — `interpreter.rs:5519`). Mid-traversal `where_(...)` re-enters the same `try_resolve_predicate_from_indexes` dispatcher (`interpreter.rs:3911-3966`) but only after the source step has already produced a vertex set — so the index is used to *intersect* the input set, not as the primary anchor.

`Predicate::eq_param("name", "name")` and friends are constructors that build a `Predicate::Compare { left: Property("name"), op: Eq, right: Param("name") }` — a `Compare` variant. The dispatcher handles `Compare` only when the parameter is resolvable to a literal (`interpreter.rs:2928-2944`); otherwise it falls through and the route post-filters.

---

## 3. Source-step dispatch table

Every source step (DSL builder → AST step → interpreter dispatch line → behavior).

| DSL | AST step | Dispatch | Index used | Fallback |
|---|---|---|---|---|
| `g().n(NodeRef::Ids(v))` | `Step::N(NodeRef::Ids)` | `interpreter.rs:5912-5920` | direct id set | none — explicit ids |
| `g().n(NodeRef::Var("x"))` | `Step::N(NodeRef::Var)` | `interpreter.rs:5919` | reuses `ctx.get_ids("x")` | none |
| `g().n(NodeRef::Param("p"))` | `Step::N(NodeRef::Param)` | `interpreter.rs:5919` | resolves param to ids | error if param missing/wrong type |
| `g().n(NodeRef::All)` | `Step::N(NodeRef::All)` | `interpreter.rs:5915` | scan all node ids (limit-aware) | always full scan |
| `g().n_where(SP)` | `Step::NWhere(SourcePredicate)` | `interpreter.rs:5923-5965` | `try_resolve_predicate_from_indexes` | `tx.vertices_where(...)` full scan at `interpreter.rs:5966` |
| `g().n_with_label("X")` | desugars to `NWhere(Eq("$label","X"))` | `dsl.rs:3221`, then 5923 | global node-label index | label scan |
| `g().n_with_label_where("X", SP)` | `NWhere(And([Eq("$label","X"), SP]))` | `dsl.rs:3233` | scoped index for SP under label X | scan within label |
| `g().e(EdgeRef::Ids(v))` | `Step::E(EdgeRef::Ids)` | `interpreter.rs:5971` | direct edge id set | none |
| `g().e_where(SP)` | `Step::EWhere(SourcePredicate)` | `interpreter.rs:5978` | `try_resolve_edge_predicate_from_indexes` (`interpreter.rs:5509`) | full edge scan |
| `g().e_with_label("L")` | desugars to `EWhere(Eq("$label","L"))` | `interpreter.rs:5519-5525` | global edge label index | full edge scan |
| `g().vector_search_nodes_with(L, P, qv, k, tenant)` | `Step::VectorSearchNodes{..}` | `interpreter.rs:5997-6065` | HNSW for `(L,P[,tenant])` | error or empty (see §6) |
| `g().text_search_nodes_with(L, P, qt, k, tenant)` | `Step::TextSearchNodes{..}` | `interpreter.rs:6068-6111` | BM25 for `(L,P[,tenant])` | empty if missing |
| `g().vector_search_edges_with(...)` | `Step::VectorSearchEdges{..}` | `interpreter.rs:6113-6173` | HNSW edge variant | empty |
| `g().text_search_edges_with(...)` | `Step::TextSearchEdges{..}` | `interpreter.rs:6176+` | BM25 edge variant | empty |

Key: when the dispatcher returns `None` (no index applicable), the source step falls back to a full label scan (`vertices_where`) or full graph scan if no label scope is available. The fallback is **silent** — there is no warning logged.

---

## 4. Predicate-index resolution catalog

`try_resolve_predicate_from_indexes` (`interpreter.rs:2610-2948`) is the central dispatcher. The match arms it recognizes:

| Predicate | Behavior | Index needed | Returns |
|---|---|---|---|
| `Eq(prop, val)` (`interpreter.rs:2623`) | scoped equality lookup | scoped equality on `(label, prop)` | `Complete` set |
| `Gt/Gte/Lt/Lte(prop, val)` (`interpreter.rs:2638-2700`) | range scan | scoped range on `(label, prop)` | `Complete` set |
| `Between(prop, min, max)` (`interpreter.rs:2702-2722`) | bounded range scan | scoped range on `(label, prop)` | `Complete` set |
| `IsIn(prop, [v1..])` (`interpreter.rs:2723-2748`) | union of equality lookups | scoped equality on `(label, prop)` | `Complete` set |
| `IsInExpr(prop, expr)` (`interpreter.rs:2749-2780`) | resolves expr → values, union of equality lookups | scoped equality | `Complete` set or `None` if expr unresolvable |
| `HasKey(prop)` (`interpreter.rs:2781-2817`) | property-prefix scan | scoped equality on `(label, prop)` (or node-label index for `$label`) | `Complete` set |
| `StartsWith(prop, prefix)` (`interpreter.rs:2818-2853`) | range scan `[prefix, prefix+MAX)` preferred; equality prefix as fallback | scoped range or scoped equality | `Candidates` set (verification needed) |
| `And(children)` (`interpreter.rs:2858-2904`) | recurses into each child; intersects results; passes the running intersection as a filter to subsequent children for cheaper sub-queries | per child | `Complete` if all children `Complete`, else `Candidates` |
| `Or(children)` (`interpreter.rs:2905-2927`) | recurses; unions results | per child — **all** must be `Complete` | `None` if any child is non-resolvable; otherwise `Complete` |
| `Compare { left, op, right }` (`interpreter.rs:2928-2944`) | `extract_param_compare` reduces to `(prop, op, value)` if the param resolves to a literal; calls the equality/range index path | as needed | `Complete` set or `None` |
| anything else | `_ => Ok(None)` (`interpreter.rs:2946`) | n/a | `None` → caller scans |

Predicates that are **never** index-resolvable:

- `Contains(prop, substring)`, `ContainsExpr(prop, expr)` — substring search, no index path. Callers full-scan and post-filter via `predicate_matches` (`interpreter.rs:511, 3973`).
- `EndsWith(prop, suffix)` — no suffix index.
- `IsNull(prop)`, `IsNotNull(prop)` — no presence/absence index axis.
- `Not(predicate)` — set complement is not in the dispatcher.
- `Or(children)` where *any* child is non-index-resolvable — the `Or` arm requires every child to return `Complete`, otherwise it bails to `Ok(None)` (`interpreter.rs:2917-2920`).
- `Compare` where the right side is not param-resolvable to a literal.

When `try_resolve_predicate_from_indexes` returns `None`:

- At a source position (`Step::NWhere`): the caller (`interpreter.rs:5923-5965`) calls `tx.vertices_where(predicate_to_property_predicate(predicate))` — a full label scan if `effective_label_scope` is set, else full graph scan.
- At a mid-traversal `Where`: the caller (`interpreter.rs:3911-3980`) calls `fetch_all_node_properties_read(tx, vertices)` and runs `predicate_matches` per row.

**`IndexedNodePredicate::Complete` vs `Candidates`.** The dispatcher returns one of two outcomes:

- `Complete(set)` — the index alone fully decides membership; no property re-check needed.
- `Candidates(set)` — the index returns a superset; a verification load + `predicate_matches` is required (`interpreter.rs:3946-3963`). Returned by `StartsWith` and `HasKey` (which over-match by property-presence) and by `And` arms when a child is `Candidates`.

---

## 5. Effective label scope

At `interpreter.rs:2620-2621`:

```rust
let derived_label_scope = Self::predicate_label_scope(predicate, params);
let effective_label_scope = label_scope.or(derived_label_scope.as_deref());
```

The label scope can come from two places:

1. The caller passed `Some(label)` (e.g. when re-entering from a labeled traversal).
2. The predicate itself contains a `SourcePredicate::Eq("$label", L)` somewhere — `predicate_label_scope` extracts it.

If neither path produces a label, every scoped-index gate fails (`interpreter.rs:2707 — Between`, `2794 — HasKey`, `2830 — StartsWith`, plus the `Eq`/range paths inside `lookup_exact_index_set` / `try_resolve_compare_index_set`) and the predicate falls to `Ok(None)` → full scan.

This is why `n_where(SourcePredicate::eq("status", "active"))` is *almost always wrong*: the predicate has no `$label`, so `effective_label_scope` is `None`, so the scoped equality index on `(SomeLabel, status)` is invisible. The fix is `n_with_label_where("Order", SourcePredicate::eq("status", "active"))` which builds an `And([Eq("$label","Order"), Eq("status","active")])` — the dispatcher walks the `And` arms, derives the label from the first, and uses the scoped equality index for the second.

`RESULT_LABEL_FIELD` is `"$label"` (`interpreter.rs:189`). It's a virtual property — never declared in your schema, but always available in `Has`/`HasKey`/`StartsWith` predicates and in projections.

---

## 6. Vector / text search internals

### Index name resolution

`resolve_vector_search_index_name` (`interpreter.rs:5222-5238`) constructs a partition-aware index name:

- If the `IndexSpec::node_vector` has a `tenant_property`, the runtime requires `tenant_value` and builds `vector_tenant_index_name(label, prop, tenant_value)`.
- If `tenant_value` is `None` but the index has a `tenant_property`, the call errors (`interpreter.rs:5234-5237`).
- If the index name doesn't exist (e.g. wrong tenant or never created), the surrounding code catches `IndexNotFound` and returns `Vec::new()` silently (`interpreter.rs:6048-6052`).

### k semantics

`SearchParams::new(k)` (`interpreter.rs:6036`) is passed straight to the HNSW engine; `k` is interpreted as "top-k by ascending distance." The result is `Vec<RankedVertexHit { id, distance }>`, wrapped into `RuntimeState::RankedVertices { vertices: <roaring>, hits: <vec> }` (`interpreter.rs:6056-6065`).

Text search (`interpreter.rs:6068-6111`) returns `Vec<RankedVertexHit { id, score }>` from Tantivy with BM25 scoring; the runtime represents it the same way (`RankedVertices`) and exposes both `$distance` (vector) and `$score` (text) as virtual fields.

### Distance / score lifecycle

`RankedVertices` and `RankedEdges` are defined at `interpreter.rs:1359-1404`. Every step that needs to operate on the vertex set calls `state.as_vertices()` (`interpreter.rs:1407-1411`) or `as_edges()` — these accessors discard the `hits` vector and return the bare roaring set. Once the next step yields `RuntimeState::Vertices(_)`, the distances are gone for good.

Steps that strip ranking metadata:

- `Out`, `In`, `Both` (mid-traversal) — call `as_vertices()` then collect neighbors (`interpreter.rs:6753+`)
- `OutE`, `InE`, `BothE` — analogous on edges
- `OutN`, `InN`, `OtherN` — switch from edges back to vertices, ranking dropped
- `Where` and `Has` filters — return `RuntimeState::Vertices` after filter (`interpreter.rs:7054`)
- `OrderBy`, `OrderByMultiple` — produce `OrderedVertices`, ranking dropped (`interpreter.rs:7088`)
- `Dedup` — operates on the bare set
- `GroupBy`, `AggregateBy`, `Count`, `Exists` — terminal aggregations

Steps that **preserve** ranking:

- `As`, `Store` (`interpreter.rs:7118-7144`) — pass-through
- `Select` (`interpreter.rs:7156-7176`) — pass-through (replays the stored state)
- Terminal projections that read state directly: `value_map`, `values`, `project`, `edge_properties` — they look up `$distance`/`$score` on the current `RankedVertices`/`RankedEdges` state (`interpreter.rs:9663-9790`)

### Pre-filter vs post-filter

Vector and text search are pure top-k against the index — there is no in-engine pre-filter combining BM25/HNSW with a property predicate. To narrow the search:

- **Tenant-scoped indexes** are the supported pre-filter mechanism. Use `IndexSpec::node_vector(L, P, Some("tenant_id"))` and pass `tenant_value` at query time.
- **Post-filtering** (`vector_search_nodes_with(...).where_(Predicate::eq("status", "active"))`) over-fetches `k` then filters; if the filter selectivity is low, increase `k`. The `where_` predicate also re-enters the index dispatcher (§4) to intersect the candidate set efficiently when an index applies.

A common foot-gun: post-filtering on tenant id when the index isn't tenant-scoped. The k-NN search has already returned the global top-k; filtering after will leave you with fewer than `k` results from the desired tenant (often zero).

---

## 7. `RuntimeState` transitions

| State | Source | Carries | Stripped by |
|---|---|---|---|
| `Empty` | initial `g()` | nothing | any source step |
| `Vertices(set)` | `N`, `NWhere`, `Out/In/Both`, `OutN/InN/OtherN`, post-`Where`, post-`Dedup` | roaring node ids | terminal aggregations |
| `Edges(set)` | `E`, `EWhere`, `OutE/InE/BothE` | roaring edge ids | terminal or `*N` |
| `OrderedVertices(vec)` | `OrderBy`, `OrderByMultiple` over Vertices | ordered ids | re-sort or aggregation |
| `OrderedEdges(vec)` | `OrderBy*` over Edges | ordered ids | re-sort or aggregation |
| `RankedVertices { vertices, hits }` | `VectorSearchNodes`, `TextSearchNodes` | ids + per-hit distance/score | any non-`As/Store/Select` step that calls `as_vertices()` |
| `RankedEdges { edges, hits }` | `VectorSearchEdges`, `TextSearchEdges` | ids + per-hit distance/score | any non-`As/Store/Select` step that calls `as_edges()` |
| terminal scalar | `Count`, `Exists`, `Id`, `Label` | count, bool, id list, label list | n/a |

`As`/`Store`/`Select`/`Inject` are state-preserving wrappers; they do not change the variant, only its name binding. `Within(var)` and `Without(var)` perform set intersection / difference against the named variable.

---

## 8. Limit and Dedup pushdown

`consume_limit_after` (`interpreter.rs:787-827`) is a single-step lookahead that recognizes:

- `step → Limit(n) | Range(_,_) | LimitBy(expr) | RangeBy(_,_)` — sets `LimitPushdown { limit: n, dedup: false }`
- `step → Dedup → Limit(n) | Range | LimitBy | RangeBy` — sets `LimitPushdown { limit: n, dedup: true }`

The flag is threaded into source/traversal collection routines (`collect_set_limited`, `collect_set_dedup_limited`) so the runtime stops as soon as `n` items are accumulated.

Limit pushdown is **disabled** for these step kinds (`interpreter.rs:807-812`):

- `EWhere(_)` — edge filter
- `EdgeHas(prop, val)` — edge property has-equals
- `EdgeHasLabel(label)` — edge label filter

For these, `Limit` runs after the full filtered set is materialized.

For pushdown to apply, the lookahead must match the **immediate next step**. A chain of filters between the step and the limit defeats it:

```text
step ─ filter ─ filter ─ Limit(10)   // no pushdown — step materializes everything
step ─ Limit(10) ─ filter ─ filter   // pushdown — step stops at 10
step ─ Dedup ─ Limit(10)             // pushdown with dedup
```

There is no global query-planner reordering; the step list is honored as written.

---

## 9. OrderBy paths

Two paths, depending on whether a range index is available for the ordering property:

1. **Range-index-backed.** `order_by_from_range_index` (`interpreter.rs:829-863`) opens a prefix scan on the property's range index, walks key order (ascending), filters to the input vertex set, and reverses for `Order::Desc`. This is O(matching ids) without a sort — one pass of the index + intersection.

2. **In-memory sort.** Without a range index, `OrderBy` falls back to `fetch_all_node_properties_read(tx, &vertices)` then `Vec::sort_by` (`interpreter.rs:7061-7091`). For large vertex sets, this is O(n log n) and must read every property value.

`OrderBy → Limit` is doubly important: with a range index, the runtime stops scanning after `n` matches (the limit pushdown applies). Without one, the entire set is sorted before the limit takes a slice — a top-K via full sort.

`OrderByMultiple([(prop1, Order::Asc), (prop2, Order::Desc)])` always uses the in-memory path; there is no composite-key range scan.

---

## 10. Projection and `value_map`

The interpreter has **no** storage-level field projection — `value_map(None)` calls `tx.get_node_properties(id)` (`interpreter.rs:9664`) which loads all stored properties for each id, then `props_to_map(&props, filter)` filters in memory based on the projection list (`interpreter.rs:9932-9946`).

Implications:

- `value_map(None)` returns *all* properties, including embeddings (F32Array/F64Array) stored inline. Network and serialization cost scales with embedding dimension.
- `value_map(Some(vec!["name"]))` still loads everything from storage — it just filters the response. The savings are in the response payload size (and the JSON serialization cost), not the read cost.
- `project(vec![PropertyProjection::new("name")])` has the same property load cost; expression projections (`ExprProjection`) compute server-side per row.
- For pure counts, `count()` (`interpreter.rs:7815`) walks the id set without loading properties.
- For id-only outputs, `id()` returns the id list; no property load.

The right way to slim payloads is therefore at the **projection list**, not at the storage layer. The first thing to remove is embeddings on search routes that don't need to display the vector.

---

## 11. Repeat semantics

`Step::Repeat(RepeatConfig { traversal, times, until, emit, max_depth, emit_predicate })` (`interpreter.rs:9281-9398`).

- `times: Option<usize>` — fixed iteration count. If `Some(n)`, the loop runs exactly `n` iterations regardless of `until`.
- `until: Option<Predicate>` — checked at each iteration boundary (`interpreter.rs:9303`). If matches, exit early.
- `max_depth: Option<usize>` — hard cap (`interpreter.rs:9291`). Without this, an `until` predicate that never matches loops until OOM.
- `emit: EmitBehavior` — `None`, `Before`, `After`, `All`. Controls which iterations contribute to the output stream.
- `emit_predicate: Option<Predicate>` — if set, only emit results that satisfy this predicate.

The DSL fluent helpers (`dsl.rs`) build a `RepeatConfig::new(sub).times(n).until(pred).emit_after().max_depth(100)`. The default `max_depth` from `RepeatConfig::new` is **not zero / not unbounded** — check the constructor; a missing call to `.max_depth(...)` may yield the constructor default. Best practice: always set it explicitly.

---

## 12. Branching cost model

| Step | Evaluation order | Short-circuit | Cost |
|---|---|---|---|
| `Choose(condition, then, else)` | partition input by condition | one arm executes per partition | sum of arm costs over their partitions |
| `Coalesce([t1, t2, ...])` (`interpreter.rs:7593-7610`) | left to right, return first non-empty | yes — stops on first hit | worst case: sum of all arms |
| `Optional(traversal)` | always runs | the *body* may short-circuit on its own steps | always pays body cost |
| `Union([t1, t2, ...])` | all arms in parallel-ish | no | sum of all arms |

`Coalesce` is the only branch that explicitly rewards ordering by cost. Put cheap probes (id-anchor, indexed equality, single-property-check) first; put expensive fallbacks (BM25, vector search, multi-step traversal) last. If the cheap probe usually wins, the expensive branch is never executed.

`Optional` is *not* a no-op branch — it always evaluates the body and merges results back. Use it for "include if matched, otherwise empty" semantics, not as a "skip if expensive" guard.

---

## 13. Batch-entry semantics

A `ReadBatch` / `WriteBatch` is a list of `BatchEntry::Query` or `BatchEntry::ForEach` items, each running in declaration order with shared variable scope.

- `var_as(name, traversal)` runs the traversal unconditionally. The result is bound to `name` in the context.
- `var_as_if(name, BatchCondition, traversal)` runs only when the condition holds. `should_execute_batch_entry` (`interpreter.rs:11126-11141`) checks the condition; if false, the entry is skipped entirely (no body cost).

`BatchCondition` variants:

- `VarNotEmpty(name)` / `VarEmpty(name)` — peek the named variable's id set
- `VarMinSize(name, n)` — true when the named variable has at least `n` items
- `PrevNotEmpty` — true when the immediately preceding entry produced a non-empty result

`for_each_param(param_name, body)` iterates over `param_name` (must be typed `["Array", "Object"]` in `parameter_types`) and runs `body` once per row, with the row's fields bound as scoped parameters inside the body. Cost: O(rows × body cost). Use for small bounded inputs (tens to low hundreds); large arrays are better handled by issuing parallel client-side requests.

Variable reuse:

- `NodeRef::var("x")` and `EdgeRef::var("x")` reference an earlier `var_as` binding by id. The interpreter uses the bound id set directly — no re-anchoring.
- `Step::Inject(name)` and `Step::Select(name)` operate on the bound state. `Inject` is a side-channel union; `Select` replaces the current stream with the named state.

---

## 14. Vector / text edge variants

`Step::VectorSearchEdges` and `Step::TextSearchEdges` mirror the node variants but produce `RankedEdges`. The hit stream exposes `$id`, `$from`, `$to`, `$distance` (or `$score`), and any edge property in projections. As with nodes, distance is dropped on `OutN`/`InN`/`OtherN` (which transition back to a vertex stream) and on `Where`/`OrderBy`. `Out`/`In`/`Both` are not applicable on edge streams; the equivalent is the `*N` family.

---

## 15. Write-path mechanics

| Step | Behavior | File:line | Foot-gun |
|---|---|---|---|
| `AddN { label, properties }` | allocates a fresh node id every call | `interpreter.rs:8954-8967` | duplicates if called twice with the same conceptual key — guard with a load + `var_as_if(VarEmpty, ...)` |
| `AddE { label, to, properties }` | creates one edge per `(current_node, target_node)` pair — cartesian product | `interpreter.rs:9024-9030` | exponential edge creation if both sides are unbounded |
| `SetProperty(name, input)` | writes the property on every node currently in the stream | `interpreter.rs:9034-9070` | silent no-op on missing nodes |
| `RemoveProperty(name)` | removes the property | similar | n/a |
| `Drop` | deletes current nodes and *all* edges attached | n/a | irreversible — bound the input stream |
| `DropEdge(to)` | removes *all* edges from each current node to each target — label-agnostic | `interpreter.rs:9089-9098` | data loss on multigraphs (drops parallel labels too) |
| `DropEdgeLabeled { to, label }` | scoped by label | `interpreter.rs:9101-9122` | same as DropEdge if label has multiple parallel edges between the pair |
| `DropEdgeById(EdgeRef)` | removes specific edge ids | `interpreter.rs:9136-9149` | safest — multigraph-friendly |
| `CreateIndex { spec, if_not_exists }` | builds the index | n/a | full scan-equivalent at creation time; do offline |
| `DropIndex { spec }` | removes the index | n/a | future queries on that path will silently fall back to scans |

For upserts, the canonical pattern is:

1. `var_as("existing", g().n_with_label_where("X", SourcePredicate::eq("uniqueId", param_id)))`
2. `var_as_if("updated", BatchCondition::VarNotEmpty("existing"), g().n(NodeRef::var("existing")).set_property(...))`
3. `var_as_if("created", BatchCondition::VarEmpty("existing"), g().add_n("X", vec![("uniqueId", PropertyInput::param("uniqueId")), ...]))`

The lookup at step 1 must hit an equality index on `(X, uniqueId)` — otherwise every upsert pays a full label scan.

---

## 16. Dynamic vs stored cost

| Aspect | Stored | Dynamic |
|---|---|---|
| AST construction | compile-time, via `#[register]` macro | per-request, JSON parse + validate |
| Parameter typing | macro-derived from Rust signature | explicit `parameter_types` map |
| Network shape | single endpoint per route | one endpoint, body carries the AST |
| Validation cost | none at runtime | per-request |
| Caching opportunity | full plan can be cached | cache by AST structure |
| Right for | steady production traffic, MCP tools | ad-hoc, admin, tests, exploration |

Query warming (`X-Helix-Warm: true` header) is read-only — it pre-runs the query without returning rows, populating caches. Returns `204 No Content`. Writes with the warm header are rejected. Warming is supported on both stored and dynamic routes.

---

## 17. Cross-skill references

- `../helix-query-rust/SKILL.md` — Rust DSL authoring guide; use when writing or revising stored Rust queries.
- `../helix-query-rust/REFERENCE.md` — full Rust DSL builder catalog including signatures and typestate.
- `../helix-query-typescript/SKILL.md` / `REFERENCE.md` — the TypeScript DSL equivalents.
- `../helix-query-json-dynamic/SKILL.md` — dynamic JSON request guide.
- `../helix-query-json-dynamic/REFERENCE.md` — authoritative JSON AST encoding catalog. Use this for every JSON example in `EXAMPLES.md`.
