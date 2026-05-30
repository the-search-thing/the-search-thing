# HQL → Rust DSL / TypeScript DSL Mapping Catalog

This is the per-feature lookup table for migrating legacy **HelixQL (HQL)** — the deprecated `.hx`
text language (`QUERY Foo(...) => ... RETURN ...`) — into the two code-native DSLs that replace it:

- **Rust DSL** — `~/github/helix-db/sdks/rust/src/dsl.rs`, registered with `#[register]` (re-exported in
  `sdks/rust/src/lib.rs`) and bundled with `helix_db::generate()` (`sdks/rust/src/query_generator.rs:219`).
- **TypeScript DSL** — `~/github/helix-db/sdks/typescript/src/index.ts`, declared with `defineParams` +
  `registerRead`/`registerWrite` and bundled with `defineQueries({...}).generate()`.

Both DSLs serialize to the **same JSON query AST**. A Rust query and a TS query that produce identical JSON are
semantically identical — that is the primary fidelity check (see §Verification).

Line numbers below were verified against the live SDK source. Re-verify them before relying on a citation,
since the SDKs move. For full builder signatures see `../helix-query-rust/REFERENCE.md` and
`../helix-query-typescript/REFERENCE.md`; this file only documents the HQL→DSL correspondence.

---

## Spelling differences between the two DSLs (read first)

The DSLs are structurally identical but spelled differently. Most translation mistakes come from these:

| Concept | Rust DSL | TypeScript DSL |
| --- | --- | --- |
| Casing | `snake_case` (`n_with_label`, `value_map`, `order_by`) | `camelCase` (`nWithLabel`, `valueMap`, `orderBy`) |
| Incoming traversal | `.in_(Some("X"))` (trailing `_`; `in` is a keyword) | `.in("X")` (`index.ts:1498`) |
| Filter step | `.where_(pred)` (trailing `_`) | `.where(pred)` (`index.ts:1531`) |
| Static constructors | `::` path — `Predicate::eq`, `NodeRef::id` | `.` member — `Predicate.eq`, `NodeRef.id` |
| Edge/traversal label | `Some("FOLLOWS")` / `None::<&str>` | `"FOLLOWS"` / `null` |
| Property lists | `vec!["a","b"]` / `Some(vec![...])` / `None::<Vec<&str>>` | `["a","b"]` / `null` |
| Write properties | `vec![("name","Alice")]` | `{ name: "Alice" }` or `[["name","Alice"]]` |
| Integers in params | native `i64` | `bigint` (`1n`) for `i64`/IDs |
| Bundle | `#[register] fn foo(..) -> ReadBatch` + `generate()` | `registerRead(fn, defineParams({..}))` + `defineQueries({..}).generate()` |

---

## Query declaration & parameters

| HQL | Rust DSL | TypeScript DSL | Notes |
| --- | --- | --- | --- |
| `QUERY Foo(p: ID) =>` (read) | `#[register] pub fn foo(p: String) -> ReadBatch { read_batch()... }` (`dsl.rs:4556`) | `const fooParams = defineParams({ p: param.string() }); function foo(_ = fooParams) { return readBatch()... }` + `registerRead(foo, fooParams)` (`index.ts:1930,2068,2299`) | HQL `ID` → `String` in Rust, `param.string()` in TS. |
| `QUERY Foo(..) =>` (write) | `#[register] pub fn foo(..) -> WriteBatch { write_batch()... }` (`dsl.rs:4562`) | `registerWrite(foo, fooParams)` (`index.ts:2308`) | Pick read vs write by whether the body mutates. The Rust typestate / TS types reject a write op inside a read batch. |
| `name: String, age: U8, vec: [F64]` | fn params `name: String, age: i64, vec: Vec<f64>` | `param.string()`, `param.i64()`, `param.array(param.f64())` | HQL integer widths (`U8`,`I32`,`U64`,…) all collapse to `i64`/`param.i64()`. `[F64]` → `Vec<f64>` / `param.array(param.f64())`. |
| Parameter use in a predicate | `Predicate::eq_param("status","status")` (`dsl.rs:1930`) | `Predicate.eqParam("status","status")` (`index.ts:692`) | Pass the **parameter name** as a string, not a value. |
| `binding <- expr` (assignment) | `.var_as("binding", expr)` (`dsl.rs:4219`) | `.varAs("binding", expr)` (`index.ts:1840`) | Each HQL `<-` line becomes a `var_as`/`varAs`. |
| `RETURN a` | `.returning(["a"])` (`dsl.rs:4261`) | `.returning(["a"])` (`index.ts:1851`) | |
| `RETURN a, b` | `.returning(["a","b"])` | `.returning(["a","b"])` | Multiple bindings → multiple top-level response fields. |
| `RETURN NONE` | `.returning([])` (return nothing) | `.returning([])` | |
| `RETURN "ok"` (literal) | **NONE** — return a binding instead | **NONE** | DSLs return named variables, not bare literals. Bind the value first if you truly need it. |

---

## Sources / anchors

| HQL | Rust DSL | TypeScript DSL | Notes |
| --- | --- | --- | --- |
| `N<T>(id)` | `g().n(NodeRef::id(id))` (`dsl.rs:3206`, `NodeRef::id` `dsl.rs:1259`) | `g().n(NodeRef.id(id))` (`index.ts:1329,467`) | Narrowest anchor — prefer it. |
| `N<T>(id)` from a param | `g().n(NodeRef::param("user_id"))` (`dsl.rs:1274`) | `g().n(NodeRef.param("userId"))` (`index.ts:473`) | |
| `N<T>` (all of a label) | `g().n_with_label("User")` (`dsl.rs:3221`) | `g().nWithLabel("User")` (`index.ts:1335`) | Always carry the label; avoid an unlabeled full scan. |
| `N<T>({field: value})` (indexed lookup) | `g().n_where(SourcePredicate::eq("field", value))` (`dsl.rs:3213`, `SourcePredicate::eq` `dsl.rs:1663`) | `g().nWhere(SourcePredicate.eq("field", value))` (`index.ts:1332,729`) | Use **`SourcePredicate` at the source** (index-friendly), **not** `.where_`. Parameterized: there is also `n_with_label_where`/`nWithLabelWhere`. |
| `E<T>(id)` | `g().e(EdgeRef::id(id))` (`dsl.rs:3342`, `EdgeRef::id` `dsl.rs:1319`) | `g().e(EdgeRef.id(id))` (`index.ts:1341,495`) | |
| `E<T>` by indexed property | `g().e_where(SourcePredicate::eq(..))` (`dsl.rs:3349`) | `g().eWhere(SourcePredicate.eq(..))` (`index.ts:1344`) | |
| `V<T>(id)` | `g().n(NodeRef::id(id))` | `g().n(NodeRef.id(id))` | Vectors are nodes in the DSL; anchor by id like any node. There is no separate `V<T>` source — see Search for similarity lookup. |

---

## Traversals

| HQL | Rust DSL | TypeScript DSL | Notes |
| --- | --- | --- | --- |
| `::Out<E>` | `.out(Some("E"))` (`dsl.rs:2138`) | `.out("E")` (`index.ts:1495`) | Target nodes via outgoing edge. `None::<&str>`/`null` = any label. |
| `::In<E>` | `.in_(Some("E"))` (`dsl.rs:2144`) | `.in("E")` (`index.ts:1498`) | Note Rust `in_`, TS `in`. |
| (undirected) | `.both(Some("E"))` (`dsl.rs:2150`) | `.both("E")` (`index.ts:1501`) | HQL has no `Both`; use only if the schema/task is genuinely symmetric. |
| `::OutE<E>` | `.out_e(Some("E"))` (`dsl.rs:2158`) | `.outE("E")` (`index.ts:1504`) | Returns the edge objects. |
| `::InE<E>` | `.in_e(Some("E"))` (`dsl.rs:2164`) | `.inE("E")` (`index.ts:1507`) | |
| `::FromN` (edge → source) | `.in_n()` (`dsl.rs:4032`) | `.inN()` (`index.ts:1516`) | From an edge, the source endpoint. |
| `::ToN` (edge → target) | `.out_n()` (`dsl.rs:4027`) | `.outN()` (`index.ts:1513`) | From an edge, the target endpoint. |
| `::FromV` / `::ToV` | edge `$from` / `$to` via `.edge_properties()` (`dsl.rs:4110`) | `.edgeProperties()` (`index.ts:1591`) | The endpoint ids are exposed as `$from`/`$to` in the edge property map. |
| anonymous `_::...` | `sub()...` (`dsl.rs:2342`) | `sub()...` (`index.ts:1775`) | Used inside branching steps (`union`/`choose`/`coalesce`/`optional`). **Not** valid inside `where_` — see Filters. |

---

## Filters & predicates

`Predicate` operates on **properties of the current element only** (`dsl.rs:1564` / `index.ts:624`). It cannot
test a sub-traversal. See §Unsupported for HQL `EXISTS`/count-in-`WHERE`.

| HQL | Rust DSL | TypeScript DSL | Notes |
| --- | --- | --- | --- |
| `::WHERE(_::{f}::EQ(v))` | `.where_(Predicate::eq("f", v))` (`dsl.rs:2214,1813`) | `.where(Predicate.eq("f", v))` (`index.ts:1531,629`) | |
| `::EQ` / `::NEQ` | `Predicate::eq` / `::neq` | `Predicate.eq` / `.neq` | |
| `::GT/::GTE/::LT/::LTE` | `Predicate::gt`/`gte`/`lt`/`lte` (`dsl.rs:1823+`) | `Predicate.gt`/`gte`/`lt`/`lte` | Numeric/string compare. |
| (parameterized compare) | `Predicate::eq_param`/`gt_param`/… (`dsl.rs:1930+`) | `Predicate.eqParam`/`gtParam`/… (`index.ts:692+`) | Preferred when the value is a query parameter. |
| `::CONTAINS(substr)` | `Predicate::contains("f", s)` (`dsl.rs:1877`) | `Predicate.contains("f", s)` | String substring. |
| `::IS_IN([..])` | `Predicate::is_in("f", vals)` (`dsl.rs:1887`) / `is_in_param` (`1897`) | `Predicate.isIn` / `.isInParam` | |
| property-existence `EXISTS(_::{f})` | `Predicate::has_key("f")` (`dsl.rs:1852`) | `Predicate.hasKey("f")` (`index.ts:1528` step / predicate) | Tests a **property** exists — not a relationship. |
| `!EXISTS(_::{f})` / null check | `Predicate::is_null("f")` (`dsl.rs:1857`) / `is_not_null` (`1862`) | `Predicate.isNull` / `.isNotNull` | |
| `AND(a, b)` / `OR(a, b)` | `Predicate::and(vec![..])` / `::or(..)` (`dsl.rs:1902,1907`) | `Predicate.and([..])` / `.or([..])` | |
| `!cond` | `Predicate::not(Box::new(..))` (`dsl.rs:1912`) | `Predicate.not(..)` | |
| `::INTERSECT(_::..)` | `.within("var")` (`dsl.rs:2226`) | `.within("var")` (`index.ts:1537`) | Set intersection with a previously stored variable. Stage the other set in a `var_as` first. |
| (set difference) | `.without("var")` (`dsl.rs:2232`) | `.without("var")` (`index.ts:1540`) | No direct HQL form; useful for `!EXISTS`-style relationship exclusion. |
| `EXISTS(traversal)` as a returned boolean | `.exists()` terminal (`dsl.rs:3720`) | `.exists()` terminal (`index.ts:1573`) | Only as a terminal on its own binding, not as a `WHERE` predicate. |

---

## Aggregation, ordering, pagination

| HQL | Rust DSL | TypeScript DSL | Notes |
| --- | --- | --- | --- |
| `::COUNT` | `.count()` terminal (`dsl.rs:3715`) | `.count()` (`index.ts:1570`) | |
| `::GROUP_BY(p)` | `.group_count("p")` (`dsl.rs:3843`) | `.groupCount("p")` (`index.ts:1618`) | HQL `GROUP_BY` returns count summaries → `group_count`. |
| `::AGGREGATE_BY(p)` (full objects) | `.group("p")` (`dsl.rs:3838`) | `.group("p")` (`index.ts:1615`) | `group` groups full objects; `group_count` returns counts. Match HQL output shape. |
| `MIN/MAX/SUM/AVG/COUNT(coll)` | `.aggregate_by(AggregateFunction::Min/Max/Sum/Mean/Count, "p")` (`dsl.rs:3848`, enum `2103`) | `.aggregateBy(AggregateFunction.Min/…, "p")` (`index.ts:1621,535`) | HQL `AVG` → `Mean`. |
| `::ORDER<Asc>(_::{f})` | `.order_by("f", Order::Asc)` (`dsl.rs:3772`, enum `2069`) | `.orderBy("f", Order.Asc)` (`index.ts:1594,525`) | |
| `::ORDER<Desc>(_::{f})` | `.order_by("f", Order::Desc)` | `.orderBy("f", Order.Desc)` | |
| `::RANGE(a, b)` | `.range(a, b)` (`dsl.rs:2271`) | `.range(a, b)` (`index.ts:1555`) | Inclusive start, exclusive end — same as HQL. |
| (limit / page size) | `.limit(n)` (`dsl.rs:2259`) / `.skip(n)` (`2265`) | `.limit(n)` (`index.ts:1549`) / `.skip(n)` | `n` accepts `Expr::param(..)` / a `ParamRef`. |
| `::FIRST` | `.limit(1)` | `.limit(1)` | **Semantic difference:** HQL `FIRST` yields a single object; `.limit(1)` yields a one-element array. Unwrap client-side. |

---

## Projections

| HQL | Rust DSL | TypeScript DSL | Notes |
| --- | --- | --- | --- |
| `::{a, b}` | `.project(vec![PropertyProjection::new("a"), PropertyProjection::new("b")])` (`dsl.rs:3756,1997`) | `.project([PropertyProjection.new("a"), PropertyProjection.new("b")])` (`index.ts:1588,842`) | Stable, explicit shape — prefer for service routes. |
| `::{a, b}` (loose map) | `.value_map(Some(vec!["a","b"]))` (`dsl.rs:3749`) | `.valueMap(["a","b"])` (`index.ts:1585`) | When a plain property map is acceptable. |
| all properties (no projection / spread `..`) | `.value_map(None::<Vec<&str>>)` | `.valueMap(null)` | DSL has no spread operator; "all properties" is `value_map` with no list. |
| `::{new: old}` (rename) | `PropertyProjection::renamed("old","new")` (`dsl.rs:2006`) | `PropertyProjection.renamed("old","new")` (`index.ts:845`) | Note argument order: **(source, alias)**. |
| `::ID` / `::{id: ::ID}` | `"$id"` in projection/value_map, or `.id()` terminal (`dsl.rs:3729`) | `"$id"`, or `.id()` (`index.ts:1576`) | The element id is the virtual field `$id`. e.g. `PropertyProjection::renamed("$id","id")`. |
| computed `::{total: ...math...}` | `ExprProjection::new("total", Expr::prop("price").mul(Expr::prop("qty")))` (`dsl.rs:2025,1404`) | `ExprProjection.new("total", Expr.prop("price").mul(Expr.prop("qty")))` (`index.ts:853,548`) | Only `+ - * / %` (`Expr::add/sub/mul/div/modulo`, `dsl.rs:1434-1454`). See §Unsupported for advanced math. |
| `::!{a, b}` (exclusion) | **NONE** — list the wanted fields explicitly | **NONE** | No "all-except" projection. Enumerate the fields to keep. |
| `user::|u|{ posts: ... }` (nested closure) | **NONE** | **NONE** | No closure/nested projection. Return the related set as a separate binding and join client-side, or use a second `var_as`. |

---

## Writes

| HQL | Rust DSL | TypeScript DSL | Notes |
| --- | --- | --- | --- |
| `AddN<T>({props})` | `g().add_n("T", vec![("name","Alice")])` (`dsl.rs:3543/3926`) | `g().addN("T", { name: "Alice" })` (`index.ts:1648`) | TS also accepts `[["name","Alice"]]`. |
| `AddN<T>` (empty) | `g().add_n("T", vec![])` | `g().addN("T")` | |
| `AddE<T>::From(a)::To(b)` | `g().n(NodeRef::var("a")).add_e("T", NodeRef::var("b"), vec![])` (`dsl.rs:3951`) | `g().n(NodeRef.var("a")).addE("T", NodeRef.var("b"), {})` (`index.ts:1651`) | `add_e` is a step on the **From** node; the **To** node is the second arg. |
| `AddE<T>({props})::From(a)::To(b)` | `.add_e("T", NodeRef::var("b"), vec![("since", since)])` | `.addE("T", NodeRef.var("b"), { since })` | |
| `::UPDATE({f: v})` | `.set_property("f", v)` (`dsl.rs:3973`) | `.setProperty("f", v)` (`index.ts:1654`) | One call per field; chain for several. Omitted fields are unchanged. |
| (remove a property) | `.remove_property("f")` (`dsl.rs:3982`) | `.removeProperty("f")` (`index.ts:1657`) | No direct HQL form. |
| `DROP N<T>(id)` | `g().n(NodeRef::id(id)).drop()` (`dsl.rs:3987`) | `g().n(NodeRef.id(id)).drop()` (`index.ts:1660`) | Dropping a node also removes its edges. |
| `DROP N<T>::OutE<E>` (edges only) | `...out_e(Some("E")).drop_edge_by_id(EdgeRef::var("e"))` or `.drop_edge_by_id(..)` (`dsl.rs:4016`) | `.dropEdgeById(EdgeRef.var("e"))` (`index.ts:1669`) | Prefer `drop_edge_by_id` (multigraph-safe) over `.drop_edge(to)` (`dsl.rs:3995`), which drops *all* edges to a target. |

---

## Search

For **runtime parameters** (vector, `k`, tenant) use the `_with` / `...With` variants
(`vector_search_nodes_with` `dsl.rs:3285` / `vectorSearchNodesWith` `index.ts:1368`;
`text_search_nodes_with` `dsl.rs:3321` / `textSearchNodesWith`) so the arguments accept
`PropertyInput::param`/`Expr::param`. The plain variants below take **concrete** values and would treat a param
name as a literal string.

| HQL | Rust DSL | TypeScript DSL | Notes |
| --- | --- | --- | --- |
| `SearchV<T>(vector, k)` | `g().vector_search_nodes("T","embedding", vec_f32, k, None)` (`dsl.rs:3264`) | `g().vectorSearchNodes("T","embedding", vector, k, null)` (`index.ts:1353`) | Pass the **precomputed** vector. The property name (`"embedding"`) is the indexed vector field. |
| `SearchV<T>(.., k)` on an edge index | `g().vector_search_edges(..)` (`dsl.rs:3397`) | `g().vectorSearchEdges(..)` (`index.ts:1415`) | |
| `SearchBM25<T>(text, k)` | `g().text_search_nodes("T","body", text, k, None)` (`dsl.rs:3303`) | `g().textSearchNodes("T","body", text, k, null)` (`index.ts:1387`) | `"body"` = the BM25-indexed text property. Edge form: `text_search_edges` (`dsl.rs:3436`). |
| tenant-scoped search | last arg `Some(PropertyValue::from("acme"))` | last arg `"acme"` | Always carry the tenant value if the original schema/route was tenant-scoped. Dropping it changes results. |
| similarity score | `$distance` / `$score` in the projection **at the search step** | same | Project the score immediately; it is not available after a further traversal hop. |
| `SearchV<T>(Embed(text), k)` | **NONE** — embed in app code, pass the vector | **NONE** | See §Unsupported (`Embed`). |

---

## Schema & indexes

HQL schema files (`N::Type {...}`, `E::Type {...}`, `V::Type {...}`) declare labels, properties, indexes, and
defaults. The query DSL does **not** declare schema. Migrate as follows:

| HQL schema feature | DSL equivalent | Notes |
| --- | --- | --- |
| `N::User { name: String, ... }` | (no DSL form) | Labels/properties are implied by the data and the labels used in queries. Keep the schema as documentation. |
| `INDEX field: T` | `g().create_index_if_not_exists(IndexSpec::node_equality("User","field"))` (`IndexSpec::node_equality` `dsl.rs:2503`) in a **write batch** | Run once at setup. |
| `UNIQUE INDEX field: T` | `IndexSpec::node_unique_equality("User","field")` (`dsl.rs:2512`) / `IndexSpec.nodeUniqueEquality` (`index.ts:971`) | |
| vector index (for `SearchV`) | `g().create_vector_index_nodes("Doc","embedding", None)` (`dsl.rs:3492`) / `createVectorIndexNodes` (`index.ts:1483`) | tenant property is the 3rd arg. |
| BM25 index (for `SearchBM25`) | `g().create_text_index_nodes("Doc","body", None)` (`dsl.rs:3517`) | |
| `DEFAULT 0` / `DEFAULT "draft"` | **NONE** | Apply the default value at write time (include it in `add_n`). |
| `DEFAULT NOW` | use the server timestamp expr: `Expr::timestamp()` (`dsl.rs:1419`) / `Expr::datetime()` (`1424`) as the property value at write time | No schema-level default; set it in the `add_n` call. |
| `DEFAULT NONE` | **NONE** — simply omit the property | Null is implicit. |

---

## Control flow

| HQL | Rust DSL | TypeScript DSL | Notes |
| --- | --- | --- | --- |
| `FOR x IN <array param> { ... }` | `.for_each_param("arr", body_batch)` (`dsl.rs:4249` read / `4339` write) | `.forEachParam("arr", body)` (`index.ts:1848`/`1898`) | Iterates the objects of an **array parameter**. Not a general loop — only over a passed-in array. |
| `FOR {a, b} IN arr { ... }` (destructuring) | reference fields by param path inside the body | same | The body batch reads fields of each array element by name. |
| nested `FOR` | nest `for_each_param` bodies | nest `forEachParam` bodies | |

---

## Unsupported HQL features (no equivalent in either DSL)

These exist in HQL but **not** in the Rust or TS DSL (verified absent from `dsl.rs` and `index.ts`). Flag each
clearly during migration and **move the logic into application code** — do not fake a DSL workaround.

- **`UpsertN` / `UpsertE` / `UpsertV`** — no upsert. Do it in app code: read first; if present, `set_property`;
  else `add_n`/`add_e`. (Two round-trips, or two conditional bindings.)
- **`RerankRRF` / `RerankMMR`** — no reranking. Run `SearchV` and/or `SearchBM25`, return the ranked lists, and
  fuse/rerank (RRF, MMR) in the application.
- **`ShortestPathBFS` / `ShortestPathDijkstras` / `ShortestPathAStar`** — no path algorithms. Compute paths in
  app code, or do bounded hop expansion and select client-side.
- **`Embed(text)`** — no inline embedding. Call your embedding model in app code and pass the resulting `[f32]`
  vector into `vector_search_nodes` / `add_n`.
- **Advanced math** — `ABS`, `SQRT`, `LN`, `LOG`, `EXP`, `CEIL`, `FLOOR`, `ROUND`, trig (`SIN`/`COS`/…),
  constants (`PI()`/`E()`). Only `+ - * / %` exist (`Expr::add/sub/mul/div/modulo`). Compute the rest app-side.
- **`WHERE(EXISTS(_::In<E>))` / `WHERE(!EXISTS(...))`** — relationship-existence filtering. `Predicate` is
  property-only. Stage the related set in a `var_as` and filter with `.within(var)` / `.without(var)`, or filter
  app-side. (`.exists()` is only a terminal boolean on its own binding.)
- **`WHERE(_::In<E>::COUNT::GT(n))`** — aggregate-in-`WHERE`. No predicate form. Compute the count as a separate
  binding, or filter app-side.
- **Nested closure projections `user::|u|{...}`** and **exclusion projections `::!{...}`** — enumerate wanted
  fields, or return related sets as separate bindings.
- **`#[model("provider:model:task")]`** — no per-query embedding-model macro (embedding is app-side anyway).
- **`#[mcp]`** — no MCP-exposure macro in the DSL.

---

## Verification (per migration)

1. **Compile.** Rust: `cargo build` / `cargo test` — the typestate checker rejects write ops in a `ReadBatch`
   and non-`SourcePredicate` at a source. TS: `tsc` — the type system rejects a write traversal in `readBatch`.
2. **AST parity.** Generate the JSON for both languages (`req.to_json_string()` `dsl.rs:4549` /
   `batch.toDynamicJson(params, values)` `index.ts:1870`, or full bundles via `generate()` →
   `queries.json`). Diff the JSON. **Identical AST = the Rust and TS migrations agree** and match the wire format.
3. **Run.** Deploy both bundles (or POST the dynamic JSON to a test Helix instance at `POST /v1/query`) on the
   same dataset the HQL query ran on. Compare row counts, ordering, and projected fields against the HQL output.

See `EXAMPLES.md` for end-to-end HQL→Rust→TS migrations, including unsupported-feature cases.
