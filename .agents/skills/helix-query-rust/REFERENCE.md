# Helix Query Authoring — Rust DSL Reference

Exhaustive builder catalog for the `helix-db` Rust crate (`sdks/rust`). Use when `SKILL.md` points you at a specific category or when you need a signature confirmed. Every entry is grouped by category; categories line up 1:1 with `../helix-query-typescript/REFERENCE.md` and `../helix-query-json-dynamic/REFERENCE.md` so you can jump between the Rust DSL, TypeScript DSL, and JSON forms.

Import: `use helix_db::dsl::prelude::*;`. All signatures come from `sdks/rust/src/dsl.rs` (re-exported at the crate root via `pub use dsl::*`); line numbers are cited inline.

## Typestate Cheat Sheet

```text
Empty  -- n,n_where,n_with_label[_where],inject,add_n,create_*_index_*,create_index_if_not_exists,drop_index
        └─> OnNodes
Empty  -- e,e_where,e_with_label[_where]                                └─> OnEdges
Empty  -- vector_search_nodes[_with], text_search_nodes[_with]          └─> OnNodes
Empty  -- vector_search_edges[_with], text_search_edges[_with]          └─> OnEdges
OnNodes -- out, in_, both, has, has_label, has_key, where_, dedup,
           within, without, limit, skip, range, as_, store, select,
           inject, order_by[_multiple], repeat, union, choose, coalesce,
           optional, path, simple_path, fold, unfold, sack_*            ↻ OnNodes
OnNodes -- out_e, in_e, both_e                                          └─> OnEdges
OnNodes -- count, exists, id, label, values, value_map, project,
           group, group_count, aggregate_by                             └─> Terminal
OnNodes(WriteEnabled) -- add_e, set_property, remove_property,
           drop, drop_edge, drop_edge_labeled, drop_edge_by_id          ↻ OnNodes
OnEdges -- out_n, in_n, other_n                                         └─> OnNodes
OnEdges -- has, has_label, has_key, where_, edge_has, edge_has_label,
           dedup, within, without, limit, skip, range, as_, store,
           select, order_by[_multiple]                                  ↻ OnEdges
OnEdges -- count, exists, id, label, edge_properties                    └─> Terminal
OnEdges(WriteEnabled) -- drop_edge_by_id                                ↻ OnEdges
```

`ReadBatch::var_as` accepts only `Traversal<_, ReadOnly>` — mixing a mutation builder into a read batch is a compile error. `WriteBatch::var_as` accepts either.

---

## Batch Entry Points

`sdks/rust/src/dsl.rs:4556`, `:4562`, `:4133`, `:2342`:

```rust
pub fn read_batch() -> ReadBatch
pub fn write_batch() -> WriteBatch
pub fn g() -> Traversal<Empty>
pub fn sub() -> SubTraversal
```

### `ReadBatch` / `WriteBatch`

- `var_as<S>(name, traversal)` — store a named result, unconditional.
- `var_as_if<S>(name, condition: BatchCondition, traversal)` — conditional entry.
- `for_each_param(param: &str, body: ReadBatch | WriteBatch)` — run `body` once per object in an array param. `body.queries` are inlined inside a `BatchEntry::ForEach`.
- `returning<I, S: Into<String>>(vars)` — restrict the response to these variable names.

### `BatchCondition`  (`sdks/rust/src/dsl.rs:4142`)

```rust
BatchCondition::VarNotEmpty(name)
BatchCondition::VarEmpty(name)
BatchCondition::VarMinSize(name, n)
BatchCondition::PrevNotEmpty
```

---

## Sources  (`Traversal<Empty>` → `Traversal<On*, _>`)

`sdks/rust/src/dsl.rs:3191` (`impl Traversal<Empty, ReadOnly>`):

```rust
// Nodes
g().n(nodes: impl Into<NodeRef>)                      -> Traversal<OnNodes>
g().n_where(pred: SourcePredicate)                    -> Traversal<OnNodes>
g().n_with_label(label)                               -> Traversal<OnNodes>
g().n_with_label_where(label, pred: SourcePredicate)  -> Traversal<OnNodes>

// Edges
g().e(edges: impl Into<EdgeRef>)                      -> Traversal<OnEdges>
g().e_where(pred: SourcePredicate)                    -> Traversal<OnEdges>
g().e_with_label(label)                               -> Traversal<OnEdges>
g().e_with_label_where(label, pred: SourcePredicate)  -> Traversal<OnEdges>

// Vector & text search
g().vector_search_nodes(label, property, query_vector: Vec<f32>, k: usize,
    tenant_value: Option<PropertyValue>)              -> Traversal<OnNodes>
g().vector_search_nodes_with(label, property,
    query_vector: impl Into<PropertyInput>,
    k: impl Into<StreamBound>,
    tenant_value: Option<PropertyInput>)              -> Traversal<OnNodes>
g().text_search_nodes(label, property, query_text, k: usize,
    tenant_value: Option<PropertyValue>)              -> Traversal<OnNodes>
g().text_search_nodes_with(label, property,
    query_text: impl Into<PropertyInput>,
    k: impl Into<StreamBound>,
    tenant_value: Option<PropertyInput>)              -> Traversal<OnNodes>
// Edge variants: vector_search_edges[_with], text_search_edges[_with]
```

Prefer the `_with` variants for parameterized routes — they accept `PropertyInput::param("x")` and `Expr::param("k")`.

---

## Traversal

Node state (`sdks/rust/src/dsl.rs:3586`, `impl<M: MutationMode> Traversal<OnNodes, M>`):

```rust
traversal.out(label: Option<impl Into<String>>)   -> Traversal<OnNodes, M>
traversal.in_(label: Option<impl Into<String>>)   -> Traversal<OnNodes, M>
traversal.both(label: Option<impl Into<String>>)  -> Traversal<OnNodes, M>
traversal.out_e(label)                            -> Traversal<OnEdges, M>
traversal.in_e(label)                             -> Traversal<OnEdges, M>
traversal.both_e(label)                           -> Traversal<OnEdges, M>
```

Edge state (`sdks/rust/src/dsl.rs:4023`, `impl<M: MutationMode> Traversal<OnEdges, M>`):

```rust
traversal.out_n()   -> Traversal<OnNodes, M>   // edge → target
traversal.in_n()    -> Traversal<OnNodes, M>   // edge → source
traversal.other_n() -> Traversal<OnNodes, M>   // edge → "other" endpoint
```

Pass `None::<&str>` to skip label filtering: `.out(None::<&str>)`.

---

## Filters

```rust
.has(prop, value: impl Into<PropertyValue>)   // both Nodes & Edges
.has_label(label)
.has_key(prop)
.where_(pred: Predicate)
.dedup()
.within(var_name)
.without(var_name)
.edge_has(prop, value: impl Into<PropertyInput>)   // Edges only
.edge_has_label(label)                             // Edges only
```

### `Predicate`  (enum `sdks/rust/src/dsl.rs:1564`, impl `:1811`)

Literal constructors:

```rust
Predicate::eq(prop, val)          Predicate::neq(prop, val)
Predicate::gt(prop, val)          Predicate::gte(prop, val)
Predicate::lt(prop, val)          Predicate::lte(prop, val)
Predicate::between(prop, min, max)
Predicate::has_key(prop)          Predicate::is_null(prop)
Predicate::is_not_null(prop)
Predicate::starts_with(prop, s)   Predicate::ends_with(prop, s)
Predicate::contains(prop, s)      Predicate::contains_param(prop, param)
Predicate::is_in(prop, vals: impl Into<PropertyValue>)
Predicate::is_in_expr(prop, expr) Predicate::is_in_param(prop, param)
Predicate::and(preds)             Predicate::or(preds)
Predicate::not(pred)
Predicate::compare(left: Expr, op: CompareOp, right: Expr)
```

Parameterized comparison shortcuts (wrap `Compare`):

```rust
Predicate::eq_param(prop, param)  Predicate::neq_param(prop, param)
Predicate::gt_param(prop, param)  Predicate::gte_param(prop, param)
Predicate::lt_param(prop, param)  Predicate::lte_param(prop, param)
```

### `SourcePredicate`  (enum `sdks/rust/src/dsl.rs:1619`, impl `:1658`)

Restricted subset for `n_where` / `e_where` (must be index-friendly):

```rust
SourcePredicate::eq / neq / gt / gte / lt / lte / between / has_key / starts_with / and / or
```

Each comparison **auto-routes** by argument type. A literal keeps the plain variant (`SourcePredicate::eq("status", "active")` → `Eq("status", String("active"))`); an `Expr`/param routes to the `*Expr` variant (`SourcePredicate::eq("status", Expr::param("s"))` → `EqExpr("status", Param("s"))`). The enum carries both forms (`Eq`/`EqExpr`, `Between`/`BetweenExpr`, etc.); `.to_predicate()` maps the `*Expr` variants to `Compare`.

**Not available** at source position: `is_null`, `is_not_null`, `contains[_param]`, `ends_with`, `is_in*`, `not`, `compare`. Push those into a following `.where_(Predicate::...)`.

### `CompareOp`

```rust
CompareOp::{Eq, Neq, Gt, Gte, Lt, Lte}
```

---

## Expressions

`Expr`  (enum `sdks/rust/src/dsl.rs:1368`, impl `:1402`):

```rust
Expr::prop(name)                    Expr::val(value: impl Into<PropertyValue>)
Expr::id()                          Expr::param(name)
Expr::timestamp()                   // server UTC epoch millis (i64)
Expr::datetime()                    // server typed DateTime
expr.add(other)    expr.sub(other)  expr.mul(other)   expr.div(other)
expr.modulo(other) expr.neg()
Expr::case(when_then: Vec<(Predicate, Expr)>, else_expr: Option<Expr>)
```

Typical uses:

- `Predicate::compare(Expr::prop("age"), CompareOp::Gte, Expr::param("minAge"))` — property-to-parameter comparison with typed coercion.
- `ExprProjection::new("age_plus_one", Expr::prop("age").add(Expr::val(1i64)))` — computed column.
- `PropertyInput::from(Expr::timestamp())` inside `add_n("Foo", vec![("createdAt", Expr::timestamp())])` — server-side timestamp stamp.

---

## Stream Bounds & Limits

```rust
.limit(n: impl Into<StreamBound>)
.skip(n: impl Into<StreamBound>)
.range(start: impl Into<StreamBound>, end: impl Into<StreamBound>)
```

`StreamBound` accepts `usize`, `u8`/`u16`/`u32`, `i64`/`i32` (errors into `Expr::Constant` when negative), and `Expr`. Canonical forms:

```rust
.limit(25usize)                 // StreamBound::Literal
.limit(Expr::param("limit"))    // StreamBound::Expr
```

---

## Variables & Injection

```rust
.as_(name)          // store current stream
.store(name)        // alias of .as_
.select(name)       // replace current stream with a stored var
.inject(name)       // inject a var into the stream (source or mid-traversal)
g().inject(name)    // Empty -> OnNodes source form
```

Cross-entry references use `NodeRef::var(name)`, `EdgeRef::var(name)`, `NodeRef::param(name)`, `EdgeRef::param(name)`.

---

## Ordering

```rust
.order_by(property, order: Order)                       // Order::{Asc, Desc}
.order_by_multiple(vec![(prop1, Order::Desc), (prop2, Order::Asc)])
```

---

## Aggregation (terminals)

```rust
.count()           -> Traversal<Terminal, M>
.exists()          -> Traversal<Terminal, M>
.group(property)   -> Traversal<Terminal, M>
.group_count(property) -> Traversal<Terminal, M>
.aggregate_by(fn: AggregateFunction, property) -> Traversal<Terminal, M>
// AggregateFunction::{Count, Sum, Min, Max, Mean}
```

---

## Branching

Each arm is a `SubTraversal`, built by `sub()` + the same filter / traversal / projection methods:

```rust
.union(vec![sub_a, sub_b, ...])
.choose(condition: Predicate, then_t: SubTraversal, else_t: Option<SubTraversal>)
.coalesce(vec![sub_a, sub_b, ...])   // first non-empty wins
.optional(sub_a)                     // pass through if sub_a is empty
```

`SubTraversal` API (struct `sdks/rust/src/dsl.rs:2124`, impl `:2129`) includes: `out`, `in_`, `both`, `out_e`, `in_e`, `both_e`, `out_n`, `in_n`, `other_n`, `has`, `has_label`, `has_key`, `where_`, `dedup`, `within`, `without`, `edge_has`, `edge_has_label`, `limit`, `skip`, `range`, `as_`, `store`, `select`, `order_by`, `order_by_multiple`, `path`, `simple_path`.

---

## Repeat

```rust
traversal.repeat(RepeatConfig::new(sub()).times(3))
traversal.repeat(
    RepeatConfig::new(sub().out(Some("KNOWS")))
        .until(Predicate::eq("title", "CEO"))
        .emit_after()
        .max_depth(10)
)
```

`RepeatConfig`  (struct `sdks/rust/src/dsl.rs:2350`, impl `:2365`):

- `.times(n: usize)` — fixed iterations
- `.until(Predicate)` — stop when predicate is true
- `.emit_all()`, `.emit_before()`, `.emit_after()` — emit policy
- `.emit_if(Predicate)` — emit only matching elements after each iteration (sets emit to `After`)
- `.max_depth(n)` — safety cap (default 100)

Default `emit` is `EmitBehavior::None` (only the final result is returned). Bound every repeat with `times` or `until`; don't rely on `max_depth` alone.

---

## Projections (terminals)

```rust
.values(vec!["name", "email"])                              -> Traversal<Terminal, M>
.value_map(Some(vec!["$id", "name"]))                       -> Traversal<Terminal, M>
.value_map(None::<Vec<&str>>)                               -> Traversal<Terminal, M>  // all properties
.project(vec![...]: Vec<impl Into<Projection>>)             -> Traversal<Terminal, M>
.edge_properties()                                          -> Traversal<Terminal, M>  // OnEdges only
```

Projection constructors (`sdks/rust/src/dsl.rs:1988-2062`):

```rust
PropertyProjection::new("name")                 // no rename; source == alias
PropertyProjection::renamed("$distance", "distance")
ExprProjection::new("age_plus_one", Expr::prop("age").add(Expr::val(1i64)))
Projection::property("source", "alias")
Projection::expr("alias", expr)
```

`PropertyProjection` and `ExprProjection` both implement `Into<Projection>`, so you can mix them freely in `.project(vec![...])`.

---

## Terminals (metadata)

```rust
.count()    .exists()    .id()    .label()
```

Usable on both node and edge streams. `.edge_properties()` is edge-only.

---

## Mutations (write-only)  (`sdks/rust/src/dsl.rs:3191`, `:3586`)

Source-position mutation (`Traversal<Empty>` → `Traversal<OnNodes, WriteEnabled>`):

```rust
g().add_n(label, vec![(prop, PropertyInput::from(val)), ...])
g().drop_edge_by_id(edges: impl Into<EdgeRef>)
g().inject(var_name)  // from var (ReadOnly side), safe to use in write batches
```

Node-state mutations (`Traversal<OnNodes, _>` → `Traversal<OnNodes, WriteEnabled>`):

```rust
.add_e(label, to: impl Into<NodeRef>, vec![(prop, PropertyInput::from(val)), ...])
.set_property(name, value: impl Into<PropertyInput>)
.remove_property(name)
.drop()
.drop_edge(to: impl Into<NodeRef>)
.drop_edge_labeled(to: impl Into<NodeRef>, label)
.drop_edge_by_id(edges: impl Into<EdgeRef>)
```

Edge-state mutation:

```rust
.drop_edge_by_id(edges: impl Into<EdgeRef>)   // OnEdges -> OnEdges, WriteEnabled
```

Key `PropertyInput` shortcuts:

```rust
PropertyInput::from("literal")              // wraps as Value(PropertyValue)
PropertyInput::from(Expr::timestamp())      // wraps Expr
PropertyInput::param("userId")              // wraps Expr::Param("userId")
```

---

## Indexes (write-only)  (`sdks/rust/src/dsl.rs:3191`)

Generic `IndexSpec` forms:

```rust
g().create_index_if_not_exists(spec: IndexSpec) -> Traversal<Terminal, WriteEnabled>
g().drop_index(spec: IndexSpec)                 -> Traversal<Terminal, WriteEnabled>
```

Convenience source forms:

```rust
g().create_vector_index_nodes(label, property, tenant_property: Option<impl Into<String>>)
g().create_vector_index_edges(label, property, tenant_property)
g().create_text_index_nodes(label, property, tenant_property)
g().create_text_index_edges(label, property, tenant_property)
```

`IndexSpec` constructors  (enum `sdks/rust/src/dsl.rs:2427`, impl `:2501`):

```rust
IndexSpec::node_equality(label, property)               // unique = false
IndexSpec::node_unique_equality(label, property)        // unique = true
IndexSpec::node_range(label, property)
IndexSpec::edge_equality(label, property)
IndexSpec::edge_range(label, property)
IndexSpec::node_vector(label, property, tenant_property: Option<impl Into<String>>)
IndexSpec::node_text(label, property, tenant_property)
IndexSpec::edge_vector(label, property, tenant_property)
IndexSpec::edge_text(label, property, tenant_property)
```

---

## Reserved / no-op builders

Emit the corresponding steps but have no effect in the current interpreter. Safe to include for forward-compatible queries.

```rust
.fold()    .unfold()    .path()    .simple_path()
.with_sack(PropertyValue::I64(0))
.sack_set(prop)    .sack_add(prop)    .sack_get()
```

---

## `#[register]` Macro & Dynamic Transport

`sdks/rust/helix-dsl-macros/src/lib.rs`. Apply to a top-level function returning `ReadBatch` or `WriteBatch`; the macro generates a wrapper that constructs a `DynamicQueryRequest` with the function's arguments as typed parameters.

```rust
#[register]
pub fn find_user(tenant_id: String, limit: i64) -> ReadBatch {
    read_batch()
        .var_as(
            "users",
            g().n_with_label("User")
                .where_(Predicate::eq_param("tenantId", "tenant_id"))
                .limit(limit)
                .value_map(Some(vec!["$id", "name"])),
        )
        .returning(["users"])
}

// Generated: callable fn that returns DynamicQueryRequest
let req = find_user("acme".to_string(), 25)?;  // Result<DynamicQueryRequest, DynamicQueryError>
let json = req.to_json_string()?;
```

Supported param types: primitives (`bool`, `i64`, `f64`, `f32`, `String`, `DateTime`), `PropertyValue`, `ParamValue`, `ParamObject`, `Vec<T>` (any supported `T`), `BTreeMap<String, T>`, `HashMap<String, T>`, `Vec<u8>` (bytes — **not supported** over the dynamic JSON route, raises `DynamicQueryError::UnsupportedBytesParameter`).

### Query bundles

`sdks/rust/src/query_generator.rs`:

```rust
pub fn build_query_bundle() -> Result<QueryBundle, GenerateError>
pub fn serialize_query_bundle(bundle: &QueryBundle) -> Result<Vec<u8>, GenerateError>
pub fn deserialize_query_bundle(bytes: &[u8]) -> Result<QueryBundle, GenerateError>
pub fn write_query_bundle_to_path<P: AsRef<Path>>(bundle: &QueryBundle, path: P) -> Result<(), GenerateError>
pub fn read_query_bundle_from_path<P: AsRef<Path>>(path: P)  -> Result<QueryBundle, GenerateError>
pub fn generate() -> Result<PathBuf, GenerateError>               // writes queries.json in CWD
pub fn generate_to_path<P: AsRef<Path>>(path: P) -> Result<PathBuf, GenerateError>
```

Wire format version: `QUERY_BUNDLE_VERSION = 4`. `deserialize_query_bundle` rejects mismatched versions.

### `DynamicQueryRequest`

```rust
DynamicQueryRequest::read(batch: ReadBatch)
DynamicQueryRequest::write(batch: WriteBatch)
req.with_parameter_value(name, DynamicQueryValue::String("x".into()))
req.with_parameter_type(name, QueryParamType::DateTime)
req.to_json_string()   // Result<String, DynamicQueryError>
req.to_json_bytes()
```

For the JSON wire encoding this produces, see `../helix-query-json-dynamic/REFERENCE.md`.

---

## Common Pitfalls

- `#[expect(dead_code)]` on a helper fails the test build if tests use it — use `#[allow(dead_code)]`.
- `ReadBatch::var_as` rejects a traversal containing any `WriteEnabled` step at compile time — if a builder call returns `Traversal<_, WriteEnabled>`, the enclosing batch must be a `WriteBatch`.
- `.out(None)` doesn't compile (ambiguous type). Use `.out(None::<&str>)` or pass `Some("LABEL")`.
- `PropertyInput::param("x")` is the idiomatic way to tie a property write to a parameter; do not construct `Expr::Param` and then wrap manually unless you need composition.
- `n_where(SourcePredicate::contains(...))` is a compile error — `SourcePredicate` does not have `contains`. Move the predicate into `.where_(Predicate::contains(...))` after the source.
- `vector_search_*` (non-`_with`) takes a concrete `Vec<f32>` + `usize`; parameterized routes need `vector_search_*_with` to accept `PropertyInput::param` / `Expr::param`.
