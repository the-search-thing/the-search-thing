---
name: helix-query-from-hql
description: Translate legacy HelixDB HQL (.hx `QUERY ... => ... RETURN`) into the Rust DSL or TypeScript DSL. Use when the input contains HQL syntax — QUERY, N<T>/E<T>/V<T>, AddN/AddE/AddV, Out/In/OutE/InE, FromN/ToN, WHERE/EQ/GT/EXISTS, SearchV/SearchBM25, GROUP_BY/AGGREGATE_BY, ORDER<Desc>/RANGE, RETURN, UpsertN, RerankRRF, ShortestPath, Embed, or .hx files — and the goal is an equivalent Rust or TypeScript DSL query. Flags HQL features with no DSL equivalent. See REFERENCE.md for the full mapping table and EXAMPLES.md for worked HQL→Rust→TS migrations.
license: MIT
metadata:
  author: HelixDB
  version: 0.1.0
---

# HQL To Helix DSL Queries

Translate legacy **HelixQL (HQL)** — the deprecated `.hx` text language (`QUERY Foo(...) => ... RETURN ...`) —
into the **Rust DSL** or **TypeScript DSL** that replace it in HelixDB v2. Both DSLs serialize to the **same JSON
query AST**, so a Rust query and a TypeScript query that emit identical JSON are semantically identical — that is
the lever you use to confirm a migration is faithful.

Some HQL features have **no equivalent in either DSL** (upsert, reranking, shortest-path, inline embedding,
advanced math, relationship-existence filters, schema defaults, macros). For those, flag the gap and move the
logic into application code — never invent a fake DSL shape.

## When To Use

Use this skill when the task is to:

- translate an HQL query or a `.hx` file into the Rust DSL or the TypeScript DSL
- port a stored HelixQL route into the v2 code-native DSL
- decide how an HQL construct (traversal, filter, projection, search, write) maps to a DSL builder
- identify which parts of an HQL query cannot be expressed in the DSL and must move to app code

Do not use this skill to author fresh DSL queries from scratch (use `helix-query-rust` / `helix-query-typescript`),
to translate Cypher or Gremlin (use those skills), or to hand-build dynamic inline JSON (use
`helix-query-json-dynamic`).

## First Steps

Before translating:

1. Decide the **target DSL** (Rust or TypeScript). If unstated, ask; the structure is identical, the spelling is
   not.
2. Parse the HQL into: parameters, anchor/source, traversal steps, filters, projection/return shape, ordering,
   pagination, and any writes.
3. Decide **read vs write** — any `AddN`/`AddE`/`AddV`/`UPDATE`/`DROP`/`Upsert` means a write batch.
4. Inspect the local repo for the real labels, edge labels, indexed properties, and route style. Do not invent
   names.
5. Scan the HQL for **unsupported features** (see below) *before* writing — they change the plan from "translate"
   to "translate the supported core + flag the rest for app code".
6. Open `REFERENCE.md` for the per-feature mapping table and `EXAMPLES.md` for end-to-end migrations.

## Translation Workflow

1. **Header → batch + params.** `QUERY Foo(p: T) =>` becomes a `read_batch()`/`write_batch()` expression (Rust)
   or a `readBatch()`/`writeBatch()` builder with `defineParams` (TS). Reference each HQL parameter explicitly:
   Rust `Predicate::eq_param("p","p")` / `NodeRef::param("p")` / `Expr::param("p")`; TS `Predicate.eqParam`,
   `NodeRef.param`, `Expr.param`. (To bundle a Rust query as a stored route, wrap the body in a `#[register] fn`
   and run `generate()`.) HQL integer widths (`U8`/`I32`/`U64`/…) all become `i64` / `param.i64()`; `ID` becomes
   `String` / `param.string()`; `[F64]` becomes `Vec<f64>` / `param.array(param.f64())`.
2. **Anchor.** Translate the first source to the narrowest form: `N<T>(id)` → `g().n(NodeRef::id/param(..))`;
   `N<T>({f:v})` → `n_where(SourcePredicate::eq(..))` (index-friendly) or `nWithLabel().where(eqParam(..))`;
   bare `N<T>` → `n_with_label("T")`. Never leave an unlabeled full scan.
3. **Traversal.** Map each `::Out`/`::In`/`::OutE`/`::InE` and `::FromN`/`::ToN` step explicitly (see Mapping
   Rules — the `in_`/`in` and `From=in_n`/`To=out_n` spellings are the common slips).
4. **Filters.** Map `WHERE`/`EQ`/`GT`/`IS_IN`/`CONTAINS`/`AND`/`OR` to `Predicate` calls. Remember `Predicate` is
   **property-only**: `EXISTS(traversal)` and count-in-`WHERE` are not predicates (see Unsupported).
5. **Shape & writes.** Map projections, aggregation, ordering, pagination, and any `Add`/`UPDATE`/`DROP` to their
   builders. Bind each HQL `<-` line as a `var_as`/`varAs`; map `RETURN a, b` to `.returning(["a","b"])`.
6. **Verify.** Compile, diff the Rust vs TS JSON AST, and run against the same data (see Verification).

## Core Mapping Rules

### 1. Source / anchor

`N<User>(id)` → `g().n(NodeRef::id(id))` / `g().n(NodeRef.id(id))`. Indexed lookup `N<User>({handle: h})` →
`g().n_where(SourcePredicate::eq("handle", h))` / `g().nWhere(SourcePredicate.eq("handle", h))` — a **source
predicate**, not `.where_`. Parameterized: `g().n_with_label("User").where_(Predicate::eq_param("handle","handle"))`.
Vectors are nodes; anchor `V<T>(id)` like any node (`g().n(NodeRef::id(id))`).

### 2. Traversal direction and edge endpoints

`::Out<E>` → `.out(Some("E"))` / `.out("E")`; `::In<E>` → `.in_(Some("E"))` / `.in("E")` (Rust keeps the
trailing underscore). `::OutE<E>`/`::InE<E>` → `.out_e`/`.in_e` / `.outE`/`.inE`. From an edge: `::FromN`
(source) → `.in_n()` / `.inN()`; `::ToN` (target) → `.out_n()` / `.outN()`.

### 3. Filters are property-only predicates

`WHERE(_::{f}::EQ(v))` → `.where_(Predicate::eq("f", v))` / `.where(Predicate.eq("f", v))`; prefer the `_param`
forms for query parameters. `AND`/`OR`/`!` → `Predicate::and(vec![..])`/`::or`/`::not`. `IS_IN` → `is_in`/`is_in_param`,
`CONTAINS` → `contains`/`contains_param`, property `EXISTS` → `has_key`, `!EXISTS`/null → `is_null`. `INTERSECT` →
`.within(var)`; set difference → `.without(var)`.

### 4. Projections

`::{a, b}` → `.project(vec![PropertyProjection::new("a"), ..])` (stable shape) or `.value_map(Some(vec!["a","b"]))`
(loose map). All properties (HQL spread / no projection) → `.value_map(None::<Vec<&str>>)` / `.valueMap(null)`. Rename
`::{new: old}` → `PropertyProjection::renamed("old","new")` — **(source, alias)** order. `::ID` is the virtual
field `$id` (e.g. `PropertyProjection::renamed("$id","userID")`). Computed fields → `ExprProjection` with
`Expr::prop(..).mul(..)` (only `+ - * / %`).

### 5. Aggregation, ordering, pagination

`::COUNT` → `.count()`; `GROUP_BY(p)` (count summaries) → `.group_count("p")`; `AGGREGATE_BY(p)` (full objects) →
`.group("p")`; `MIN/MAX/SUM/AVG/COUNT(coll)` → `.aggregate_by(AggregateFunction::Min/Max/Sum/Mean/Count, "p")`
(`AVG`=`Mean`). `ORDER<Asc|Desc>(_::{f})` → `.order_by("f", Order::Asc|Desc)`. `RANGE(a,b)` → `.range(a,b)`.
`FIRST` → `.limit(1)` (note: yields a one-element array, not a single object — unwrap client-side).

### 6. Writes

`AddN<T>({props})` → `g().add_n("T", vec![..])` / `g().addN("T", {..})`. `AddE<T>::From(a)::To(b)` →
`g().n(NodeRef::var("a")).add_e("T", NodeRef::var("b"), vec![..])` (the `add_e` step is on the From node, To is
the 2nd arg). `::UPDATE({f:v})` → `.set_property("f", v)` (one call per field). `DROP N<T>(id)` →
`.drop()`; drop edges only via `.drop_edge_by_id`/`.dropEdgeById` (multigraph-safe). All writes need
`write_batch`/`writeBatch`.

### 7. Search

`SearchV<T>(vector, k)` → `g().vector_search_nodes("T","embedding", vector, k, tenant)` /
`g().vectorSearchNodes(..)` with a **precomputed** vector. For runtime parameters use the **`_with`/`...With`**
variants (`vector_search_nodes_with` / `vectorSearchNodesWith`, and `text_search_nodes_with` /
`textSearchNodesWith`) so vector, `k`, and tenant accept `PropertyInput::param`/`Expr::param` — the plain
variants take concrete values and would treat a param name as a literal. `SearchBM25<T>(text, k)` →
`text_search_nodes` / `textSearchNodes`. Carry the tenant value through the last arg if the route was
tenant-scoped, and project `$distance`/`$score` at the search step (it is gone after a further hop).

### 8. Query header, params, and return

Each `binding <- expr` → `.var_as("binding", expr)` / `.varAs(..)`. `RETURN a, b` → `.returning(["a","b"])`.
`RETURN NONE` → `.returning([])`. `RETURN "literal"` has no form — return a binding instead. Reference parameters
by **name string** in predicates (`Predicate::eq_param("status","status")`).

### 9. `FOR ... IN` over an array parameter

`FOR x IN arr { ... }` where `arr` is an array parameter → `.for_each_param("arr", body_batch)` /
`.forEachParam("arr", body)`. This iterates an array parameter only — it is not a general loop.

### 10. Schema and indexes

Schema (`N::/E::/V::`) is not declared in the query DSL. `INDEX` / `UNIQUE INDEX` → a one-time write batch with
`create_index_if_not_exists(IndexSpec::node_equality | node_unique_equality(..))`; vector/BM25 indexes via
`create_vector_index_nodes` / `create_text_index_nodes`. `DEFAULT`/`DEFAULT NONE` have no form — set the value (or
omit it) at write time. `DEFAULT NOW` → `Expr::timestamp()`/`Expr::datetime()` as the property value in `add_n`.

## Unsupported HQL Features

These exist in HQL but **not** in the Rust or TS DSL (verified absent from `dsl.rs` and `index.ts`). Flag each one
explicitly and move the logic to **application code** — do not improvise a DSL workaround:

- **`UpsertN`/`UpsertE`/`UpsertV`** — no upsert. App-side read-then-branch: if found `set_property`, else `add_n`.
- **`RerankRRF`/`RerankMMR`** — no reranking. Return the ranked list(s) and fuse/rerank in the app.
- **`ShortestPathBFS`/`ShortestPathDijkstras`/`ShortestPathAStar`** — no path algorithms. Compute paths app-side.
- **`Embed(text)`** — no inline embedding. Embed in app code; pass the resulting vector to `vector_search_nodes`.
- **Advanced math** — `ABS`/`SQRT`/`LN`/`LOG`/`EXP`/`CEIL`/`FLOOR`/`ROUND`, trig, `PI()`/`E()`. Only `+ - * / %`
  exist (`Expr::add/sub/mul/div/modulo`). Compute the rest app-side.
- **`WHERE(EXISTS(_::traversal))` / `!EXISTS` / `WHERE(_::traversal::COUNT::GT(n))`** — `Predicate` is
  property-only. Stage the related set and use `.within(var)`/`.without(var)`, or filter app-side.
- **Nested closure projections `::|v|{...}`** and **exclusion projections `::!{...}`** — enumerate the wanted
  fields, or return related sets as separate bindings.
- **`#[model(...)]`** and **`#[mcp]`** macros — no DSL equivalent.

## Canonical Example

HQL:

```helixql
QUERY ActiveFollowing(user_id: ID, status: String, limit: I64) =>
    results <- N<User>(user_id)::Out<Follows>::WHERE(_::{status}::EQ(status))::ORDER<Desc>(_::{createdAt})::RANGE(0, limit)
    RETURN results::{userID: ::ID, name, status}
```

Rust DSL:

```rust
read_batch()
    .var_as(
        "results",
        g().n(NodeRef::param("user_id"))
            .out(Some("Follows"))
            .where_(Predicate::eq_param("status", "status"))
            .order_by("createdAt", Order::Desc)
            .range(0, Expr::param("limit"))
            .project(vec![
                PropertyProjection::renamed("$id", "userID"),
                PropertyProjection::new("name"),
                PropertyProjection::new("status"),
            ]),
    )
    .returning(["results"])
```

TypeScript DSL:

```ts
const activeFollowingParams = defineParams({ userId: param.string(), status: param.string(), limit: param.i64() });

function activeFollowing(_ = activeFollowingParams) {
  return readBatch()
    .varAs(
      "results",
      g()
        .n(NodeRef.param("userId"))
        .out("Follows")
        .where(Predicate.eqParam("status", "status"))
        .orderBy("createdAt", Order.Desc)
        .range(0, Expr.param("limit"))
        .project([
          PropertyProjection.renamed("$id", "userID"),
          PropertyProjection.new("name"),
          PropertyProjection.new("status"),
        ]),
    )
    .returning(["results"]);
}

const body = activeFollowing().toDynamicJson(activeFollowingParams, { userId: "u-42", status: "active", limit: 20n });
```

## Anti-Patterns

Do not:

- use `.where_`/`.where` for an indexed source lookup — use `n_where`/`nWhere` with a `SourcePredicate`
- mix up the spellings: Rust `.in_(Some("X"))`/`.where_(..)` vs TS `.in("X")`/`.where(..)`; `::` vs `.` constructors
- invert edge endpoints — `::FromN` is `.in_n()`, `::ToN` is `.out_n()`
- translate `EXISTS`/count-in-`WHERE` into a `Predicate` (it has no such variant) — use set ops or app code
- drop the tenant value on a `SearchV`/`SearchBM25` that was tenant-scoped, or read `$distance` after a hop
- invent a DSL shape for `Upsert`/`Rerank`/`ShortestPath`/`Embed`/advanced math — flag and defer to app code
- return all properties by default — match the HQL projection
- invent labels, edge labels, or properties instead of reading the target schema

## Validation Checklist

Before finishing:

- read vs write batch matches whether the HQL mutates
- parameters typed correctly (widths → `i64`, `ID` → `String`/`param.string()`, `[F64]` → array)
- anchor is the narrowest justified form; no stray unlabeled scans
- edge directions and `FromN`/`ToN` endpoints are correct
- filters are explicit `Predicate` logic; `EXISTS`/count filters handled via set ops or flagged for app code
- projection matches the HQL return shape; `::ID` mapped to `$id`
- tenant scope preserved on search; `$distance`/`$score` projected at the search step
- every unsupported feature is flagged and its logic assigned to application code
- the migration was **compiled**, the Rust/TS **JSON AST diffed for parity**, and **run** against the same data
  (see Verification)

## Verification

The fidelity check is **compile → AST parity → run**:

1. **Compile.** Rust: `cargo build` / `cargo test` — the typestate checker rejects write ops in a `ReadBatch` and
   non-`SourcePredicate` at a source. TS: `tsc` — the type system rejects a write traversal inside `readBatch`.
2. **AST parity.** Emit the JSON for both languages (`req.to_json_string()` /
   `batch.toDynamicJson(params, values)`, or full bundles via `generate()` → `queries.json`) and diff them.
   Identical JSON means the Rust and TS migrations agree and match the wire format.
3. **Run.** Deploy both bundles (or POST the dynamic JSON to a test Helix instance at `POST /v1/query`) on the
   **same dataset** the original HQL ran on, and compare row counts, ordering, and projected fields against the
   HQL output. If the `helixdb-docs` MCP tools or a `helix` CLI are available, use them to sanity-check builder
   names and run the queries.

## Reference Files

- `REFERENCE.md` — the full HQL → Rust → TypeScript mapping table, source-cited, with the Unsupported list.
- `EXAMPLES.md` — 15 worked HQL→Rust→TS migrations, including unsupported-feature cases.

## Related Skills

- `helix-query-rust` — full Rust DSL builder catalog; use it to validate the Rust query you produce.
- `helix-query-typescript` — full TypeScript DSL catalog; the TS query emits the same JSON AST.
- `helix-query-json-dynamic` — the inline JSON form of the same query, useful for the AST-parity check.
- `helix-query-optimize` — once migrated, use this to confirm the anchor and indexes are efficient.
- `helix-memory-system` — for hybrid recall (vector + BM25 + app-side RRF) when migrating reranked search.
