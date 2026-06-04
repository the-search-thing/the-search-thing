# Helix Dynamic Query — JSON AST Reference

Exhaustive variant catalog for the `POST /v1/query` inline AST. Every variant shows its Rust signature, its JSON encoding, and a one-line semantics note. Organized for grep: each category header is a stable anchor.

Rust signatures and line numbers cite the canonical AST source — the `helix-db` crate at `sdks/rust/src/dsl.rs` (re-exported at the crate root via `pub use dsl::*`). The TypeScript DSL (`@helix-db/helix-db`) emits structurally identical JSON. Both DSLs can produce these bodies: Rust `DynamicQueryRequest::{read,write}(batch).to_json_string()` (see `../helix-query-rust/`), TypeScript `batch.toDynamicJson(params, values)` (see `../helix-query-typescript/`).

Conventions used below:

- `<X>` — a JSON value of type X (defined elsewhere in this document).
- Encoding rules (serde default **externally tagged** unless marked otherwise):
  - Unit variant → bare string: `"Count"`.
  - Tuple variant, 1 field → `{"Var": <inner>}`.
  - Tuple variant, 2+ fields → `{"Var": [<f1>, <f2>, ...]}`.
  - Struct variant → `{"Var": {"field1": ..., "field2": ...}}`.
  - `#[serde(untagged)]` — inner value written directly, no variant tag.

---

## 1. Envelope

### `DynamicQueryRequest`  (`sdks/rust/src/dsl.rs:4479`)

```json
{
  "request_type": "read" | "write",
  "query": <BatchQuery>,
  "parameters": { "<name>": <DynamicQueryValue>, ... } | null,
  "parameter_types": { "<name>": <QueryParamType>, ... } | null
}
```

- `request_type` — `#[serde(rename_all = "lowercase")]`. Only `"read"` / `"write"`.
- `parameters` / `parameter_types` — both optional; serialize via `skip_serializing_if = "Option::is_none"`. Server accepts `null` or omission.

### `BatchQuery`  (`sdks/rust/src/dsl.rs:4365`)  —  `#[serde(untagged)]`

Value written inline; **no `{"Read": ...}` or `{"Write": ...}` wrapper**. Whichever object shape is present (`ReadBatch` / `WriteBatch`) both look structurally identical:

```json
{ "queries": [<BatchEntry>, ...], "returns": ["<var>", ...] }
```

### `ReadBatch` / `WriteBatch`  (`sdks/rust/src/dsl.rs:4190`, `:4280`)

Same JSON shape — the distinction is enforced on the Rust side; JSON distinguishes via the envelope's `request_type`.

| Field | Type | Description |
|---|---|---|
| `queries` | `[BatchEntry, ...]` | Entries executed in order |
| `returns` | `["<var>", ...]` | Named variables to include in the response; empty = all |

### `BatchEntry`  (`sdks/rust/src/dsl.rs:4168`)

Tagged enum with two variants:

```json
{"Query": <NamedQuery>}
{"ForEach": {"param": "<param_name>", "body": [<BatchEntry>, ...]}}
```

- `ForEach.param` must reference a top-level parameter typed as `{"Array": "Object"}` (an array of objects). Each iteration binds the current object's fields as scoped parameters inside `body`.

### `NamedQuery`  (`sdks/rust/src/dsl.rs:4156`)

```json
{
  "name": "<var_name>" | null,
  "steps": [<Step>, ...],
  "condition": <BatchCondition> | null
}
```

- `name` stores the result under that variable; `null` means no storage.
- `condition` gates execution of the entire entry.

### `BatchCondition`  (`sdks/rust/src/dsl.rs:4142`)

```json
{"VarNotEmpty": "<var>"}        // execute only if var has >=1 item
{"VarEmpty": "<var>"}           // execute only if var is empty
{"VarMinSize": ["<var>", 5]}    // execute only if var has >=N items
"PrevNotEmpty"                  // unit variant — previous entry produced rows
```

---

## 2. Primitive Values

### `PropertyValue`  (`sdks/rust/src/dsl.rs:973`)  —  externally tagged

Used everywhere inside the AST where a literal appears (e.g. `Predicate::Eq`, `Step::Has`, `Expr::Constant`, `PropertyInput::Value`).

| Variant | Rust | JSON |
|---|---|---|
| `Null` | `Null` | `"Null"` |
| `Bool(bool)` | `Bool(true)` | `{"Bool": true}` |
| `I64(i64)` | `I64(42)` | `{"I64": 42}` |
| `DateTime(i64)` | `DateTime(1712313296000)` | `{"DateTime": 1712313296000}` (epoch millis, UTC) |
| `F64(f64)` | `F64(3.14)` | `{"F64": 3.14}` |
| `F32(f32)` | `F32(1.5)` | `{"F32": 1.5}` |
| `String(String)` | `String("x")` | `{"String": "x"}` |
| `Bytes(Vec<u8>)` | `Bytes(vec![1,2])` | `{"Bytes": [1, 2]}` — **not supported over the dynamic JSON route** |
| `I64Array(Vec<i64>)` | `I64Array(vec![1,2])` | `{"I64Array": [1, 2]}` |
| `F64Array(Vec<f64>)` | `F64Array(vec![0.1])` | `{"F64Array": [0.1]}` |
| `F32Array(Vec<f32>)` | `F32Array(vec![0.1])` | `{"F32Array": [0.1]}` |
| `StringArray(Vec<String>)` | `StringArray(vec!["a"])` | `{"StringArray": ["a"]}` |
| `Array(Vec<PropertyValue>)` | heterogeneous | `{"Array": [{"I64": 1}, {"String": "a"}]}` |
| `Object(BTreeMap<String, PropertyValue>)` | | `{"Object": {"k": {"I64": 1}}}` |

### `PropertyInput`  (`sdks/rust/src/dsl.rs:1197`)

Used in mutation step property lists (`AddN`, `AddE`, `SetProperty`, `EdgeHas`) and in `VectorSearchNodes.query_vector` / `VectorSearchEdges.query_vector` / `tenant_value`.

```json
{"Value": <PropertyValue>}      // literal
{"Expr": <Expr>}                // resolved at runtime (e.g. from a parameter)
```

`PropertyInput::param("x")` is syntactic sugar for `{"Expr": {"Param": "x"}}`.

### `NodeRef`  (`sdks/rust/src/dsl.rs:1241`)

```json
{"Ids": [1, 2, 3]}              // concrete node ids (u64)
{"Var": "<name>"}               // nodes stored in a prior-batch variable
{"Param": "<name>"}             // array of ids from a parameter
```

### `EdgeRef`  (`sdks/rust/src/dsl.rs:1308`)

Same three variants as `NodeRef` but over edge ids:

```json
{"Ids": [10, 20]} | {"Var": "<name>"} | {"Param": "<name>"}
```

### `StreamBound`  (`sdks/rust/src/dsl.rs:1474`)

Non-negative integer for `limit`, `skip`, `range` bounds.

```json
{"Literal": 25}                 // known at build time
{"Expr": <Expr>}                // resolved at runtime — e.g. {"Expr": {"Param": "limit"}}
```

---

## 3. Parameter Values & Types

### `DynamicQueryValue`  (`sdks/rust/src/dsl.rs:4458`)  —  `#[serde(untagged)]`

Values inside the top-level `parameters` map are **bare JSON** — no variant tag.

| Rust | JSON |
|---|---|
| `Null` | `null` |
| `Bool(b)` | `true` / `false` |
| `I64(n)` | `42` |
| `F64(x)` / `F32(x)` | `3.14` |
| `String(s)` | `"acme"` |
| `Array(vs)` | `["a", "b"]` |
| `Object(m)` | `{"k": 1}` |

Example (from `tests/register_metadata_tests.rs:184`):

```json
"parameters": {"limit": 25, "tenant_id": "acme"}
```

### `QueryParamType`  (`src/query_generator.rs:9-31`)  —  externally tagged

Unit scalars as bare strings:

```text
"Bool" | "I64" | "F64" | "F32" | "String" | "DateTime" | "Bytes" | "Value" | "Object"
```

`Array` is a single-field tuple variant — wraps its inner type:

```json
{"Array": "String"}                     // Vec<String>
{"Array": "F64"}                        // Vec<f64> — e.g. a query vector
{"Array": {"Array": "F64"}}             // Vec<Vec<f64>> — a batch of vectors
{"Array": "Object"}                     // Vec<ParamObject> — used by ForEach
```

Example (from `tests/register_metadata_tests.rs:185`):

```json
"parameter_types": {"limit": "I64", "tenant_id": "String"}
```

---

## 4. Expressions

### `Expr`  (`sdks/rust/src/dsl.rs:1368`)

| Variant | Rust | JSON |
|---|---|---|
| `Property(String)` | `Expr::prop("age")` | `{"Property": "age"}` |
| `Id` | `Expr::id()` | `"Id"` |
| `Timestamp` | `Expr::timestamp()` | `"Timestamp"` — server UTC epoch millis |
| `DateTimeNow` | `Expr::datetime()` | `"DateTimeNow"` — typed server datetime |
| `Constant(PropertyValue)` | `Expr::val(1i64)` | `{"Constant": {"I64": 1}}` |
| `Param(String)` | `Expr::param("min")` | `{"Param": "min"}` |
| `Add(Box<Expr>, Box<Expr>)` | `a.add(b)` | `{"Add": [<Expr>, <Expr>]}` |
| `Sub(..)` | `a.sub(b)` | `{"Sub": [<Expr>, <Expr>]}` |
| `Mul(..)` | `a.mul(b)` | `{"Mul": [<Expr>, <Expr>]}` |
| `Div(..)` | `a.div(b)` | `{"Div": [<Expr>, <Expr>]}` |
| `Mod(..)` | `a.modulo(b)` | `{"Mod": [<Expr>, <Expr>]}` |
| `Neg(Box<Expr>)` | `a.neg()` | `{"Neg": <Expr>}` |
| `Case { when_then, else_expr }` | `Expr::case(branches, Some(fallback))` | see below |

`Case` JSON shape:

```json
{
  "Case": {
    "when_then": [
      [<Predicate>, <Expr>],
      [<Predicate>, <Expr>]
    ],
    "else_expr": <Expr> | null
  }
}
```

Each `when_then` entry is a 2-tuple `[predicate, expr]` — a `Vec<(Predicate, Expr)>` in Rust. `else_expr` may be omitted or `null`; when absent the result is explicit `Null`.

---

## 5. Predicates

### `CompareOp`  (`sdks/rust/src/dsl.rs:1545`)

Unit variants as bare strings: `"Eq"`, `"Neq"`, `"Gt"`, `"Gte"`, `"Lt"`, `"Lte"`.

### `Predicate`  (`sdks/rust/src/dsl.rs:1564`)

| Variant | JSON |
|---|---|
| `Eq(prop, val)` | `{"Eq": ["<prop>", <PropertyValue>]}` |
| `Neq(prop, val)` | `{"Neq": ["<prop>", <PropertyValue>]}` |
| `Gt(prop, val)` | `{"Gt": ["<prop>", <PropertyValue>]}` |
| `Gte(prop, val)` | `{"Gte": ["<prop>", <PropertyValue>]}` |
| `Lt(prop, val)` | `{"Lt": ["<prop>", <PropertyValue>]}` |
| `Lte(prop, val)` | `{"Lte": ["<prop>", <PropertyValue>]}` |
| `Between(prop, min, max)` | `{"Between": ["<prop>", <PropertyValue>, <PropertyValue>]}` |
| `HasKey(prop)` | `{"HasKey": "<prop>"}` |
| `IsNull(prop)` | `{"IsNull": "<prop>"}` |
| `IsNotNull(prop)` | `{"IsNotNull": "<prop>"}` |
| `StartsWith(prop, s)` | `{"StartsWith": ["<prop>", "<s>"]}` |
| `EndsWith(prop, s)` | `{"EndsWith": ["<prop>", "<s>"]}` |
| `Contains(prop, s)` | `{"Contains": ["<prop>", "<s>"]}` |
| `ContainsExpr(prop, expr)` | `{"ContainsExpr": ["<prop>", <Expr>]}` — e.g. from `contains_param` |
| `IsIn(prop, values)` | `{"IsIn": ["<prop>", <PropertyValue>]}` — value usually an array variant |
| `IsInExpr(prop, expr)` | `{"IsInExpr": ["<prop>", <Expr>]}` — from `is_in_param` |
| `And(ps)` | `{"And": [<Predicate>, ...]}` |
| `Or(ps)` | `{"Or": [<Predicate>, ...]}` |
| `Not(p)` | `{"Not": <Predicate>}` |
| `Compare { left, op, right }` | `{"Compare": {"left": <Expr>, "op": <CompareOp>, "right": <Expr>}}` |

`Predicate::eq_param("prop", "param")` is syntactic sugar for:

```json
{"Compare": {"left": {"Property": "prop"}, "op": "Eq", "right": {"Param": "param"}}}
```

Same pattern for `neq_param`, `gt_param`, `gte_param`, `lt_param`, `lte_param`.

### `SourcePredicate`  (`sdks/rust/src/dsl.rs:1619`) — used in `NWhere` / `EWhere`

Strict subset of `Predicate`. Same JSON shape for the shared variants; the following are **not allowed** at source-step position: `IsNull`, `IsNotNull`, `Contains`, `ContainsExpr`, `EndsWith`, `IsIn`, `IsInExpr`, `Not`, `Compare`. Use `Step::Where` for those after the source.

---

## 6. Projections

### `PropertyProjection`  (`sdks/rust/src/dsl.rs:1988`)

```json
{"source": "<property>", "alias": "<output_name>"}
```

Both fields required; set them equal for no-rename. Virtual fields (`$id`, `$label`, `$distance`, `$from`, `$to`) are legal `source` values.

### `ExprProjection`  (`sdks/rust/src/dsl.rs:2016`)

```json
{"alias": "<output_name>", "expr": <Expr>}
```

### `Projection`  (`sdks/rust/src/dsl.rs:2036`)  —  `#[serde(untagged)]`

A `Vec<Projection>` inside a `Project` step contains a mix of `PropertyProjection` and `ExprProjection` objects **without variant wrappers**. Disambiguation is by field shape (`source + alias` vs `alias + expr`):

```json
[
  {"source": "$id", "alias": "id"},
  {"source": "name", "alias": "name"},
  {"alias": "age_plus_one", "expr": {"Add": [{"Property": "age"}, {"Constant": {"I64": 1}}]}}
]
```

---

## 7. Order, Emit, Aggregation

### `Order`  (`sdks/rust/src/dsl.rs:2069`)

Bare strings: `"Asc"`, `"Desc"`.

### `EmitBehavior`  (`sdks/rust/src/dsl.rs:2084`)

Bare strings: `"None"`, `"Before"`, `"After"`, `"All"`.

### `AggregateFunction`  (`sdks/rust/src/dsl.rs:2103`)

Bare strings: `"Count"`, `"Sum"`, `"Min"`, `"Max"`, `"Mean"`.

---

## 8. SubTraversal & RepeatConfig

### `SubTraversal`  (`sdks/rust/src/dsl.rs:2124`)

```json
{"steps": [<Step>, ...]}
```

Used wherever an inner traversal is needed: `Union`, `Choose.then_traversal`, `Choose.else_traversal`, `Coalesce`, `Optional`, `Repeat.traversal`.

### `RepeatConfig`  (`sdks/rust/src/dsl.rs:2350`)

```json
{
  "traversal": <SubTraversal>,
  "times": <usize> | null,
  "until": <Predicate> | null,
  "emit": <EmitBehavior>,
  "emit_predicate": <Predicate> | null,
  "max_depth": <usize>
}
```

- `times` — fixed number of iterations. At least one of `times` / `until` should be set to bound the loop.
- `until` — stop when the predicate becomes true against the current stream.
- `emit` — what to include in the result stream (default `"None"` emits only the final stream).
- `emit_predicate` — if set, only emit elements matching this predicate (`emit` becomes effectively `"After"` when present).
- `max_depth` — safety cap (default `100`).

---

## 9. IndexSpec

`IndexSpec`  (`sdks/rust/src/dsl.rs:2427`):

```json
{"NodeEquality": {"label": "<L>", "property": "<p>", "unique": false}}
{"NodeRange":    {"label": "<L>", "property": "<p>"}}
{"EdgeEquality": {"label": "<L>", "property": "<p>"}}
{"EdgeRange":    {"label": "<L>", "property": "<p>"}}
{"NodeVector":   {"label": "<L>", "property": "<p>", "tenant_property": "<tp>" | null}}
{"NodeText":     {"label": "<L>", "property": "<p>", "tenant_property": "<tp>" | null}}
{"EdgeVector":   {"label": "<L>", "property": "<p>", "tenant_property": "<tp>" | null}}
{"EdgeText":     {"label": "<L>", "property": "<p>", "tenant_property": "<tp>" | null}}
```

- `NodeEquality.unique` defaults to `false`. When `true`, insert / update of duplicate non-null values is rejected.
- `tenant_property` — if set, creates a multitenant index partitioned by that property.

---

## 10. Step Catalog

All Step variants (`sdks/rust/src/dsl.rs:2606-3062`) grouped by category. **TS** = typestate requirement (`E` = Empty source position, `N` = on nodes, `X` = on edges, `*` = any). **W** = write-only.

### Sources (TS: `E` unless noted)

| Step | Rust | JSON |
|---|---|---|
| `N(NodeRef)` | `.n(...)` | `{"N": <NodeRef>}` |
| `NWhere(SourcePredicate)` | `.n_where(...)` | `{"NWhere": <SourcePredicate>}` |
| `E(EdgeRef)` | `.e(...)` | `{"E": <EdgeRef>}` |
| `EWhere(SourcePredicate)` | `.e_where(...)` | `{"EWhere": <SourcePredicate>}` |
| `VectorSearchNodes { label, property, tenant_value?, query_vector, k }` | `.vector_search_nodes(...)` | `{"VectorSearchNodes": {"label":"...", "property":"...", "tenant_value": <PropertyInput>|null, "query_vector": <PropertyInput>, "k": <StreamBound>}}` |
| `TextSearchNodes { label, property, tenant_value?, query_text, k }` | `.text_search_nodes(...)` | `{"TextSearchNodes": {"label":"...", "property":"...", "tenant_value": <PropertyInput>|null, "query_text": <PropertyInput>, "k": <StreamBound>}}` |
| `VectorSearchEdges { ... }` | `.vector_search_edges(...)` | `{"VectorSearchEdges": {...}}` |
| `TextSearchEdges { ... }` | `.text_search_edges(...)` | `{"TextSearchEdges": {...}}` |

`n_with_label("User")` is sugar for `NWhere(SourcePredicate::Eq("$label", "User"))`.

### Node traversal (TS: `N`, produces `X` on `*E`)

| Step | JSON |
|---|---|
| `Out(Option<String>)` | `{"Out": "LABEL"}` or `{"Out": null}` — outgoing nodes (via edges) |
| `In(Option<String>)` | `{"In": "LABEL" | null}` |
| `Both(Option<String>)` | `{"Both": "LABEL" | null}` |
| `OutE(Option<String>)` | `{"OutE": "LABEL" | null}` — switch to outgoing edges |
| `InE(Option<String>)` | `{"InE": "LABEL" | null}` |
| `BothE(Option<String>)` | `{"BothE": "LABEL" | null}` |

### Edge traversal (TS: `X`, produces `N`)

| Step | JSON |
|---|---|
| `OutN` | `"OutN"` — edge → target node |
| `InN` | `"InN"` — edge → source node |
| `OtherN` | `"OtherN"` — edge → the "other" endpoint relative to prior context |

### Filters (TS: `N` or `X` where it makes sense)

| Step | JSON |
|---|---|
| `Has(String, PropertyValue)` | `{"Has": ["<prop>", <PropertyValue>]}` |
| `HasLabel(String)` | `{"HasLabel": "<L>"}` |
| `HasKey(String)` | `{"HasKey": "<prop>"}` |
| `Where(Predicate)` | `{"Where": <Predicate>}` |
| `Dedup` | `"Dedup"` |
| `Within(String)` | `{"Within": "<var>"}` |
| `Without(String)` | `{"Without": "<var>"}` |
| `EdgeHas(String, PropertyInput)` | `{"EdgeHas": ["<prop>", <PropertyInput>]}` (TS: `X`) |
| `EdgeHasLabel(String)` | `{"EdgeHasLabel": "<L>"}` (TS: `X`) |

### Limits (TS: `N` or `X`)

| Step | JSON |
|---|---|
| `Limit(usize)` | `{"Limit": 10}` |
| `LimitBy(Expr)` | `{"LimitBy": <Expr>}` |
| `Skip(usize)` | `{"Skip": 5}` |
| `SkipBy(Expr)` | `{"SkipBy": <Expr>}` |
| `Range(usize, usize)` | `{"Range": [0, 25]}` |
| `RangeBy(StreamBound, StreamBound)` | `{"RangeBy": [<StreamBound>, <StreamBound>]}` |

### Variables

| Step | JSON |
|---|---|
| `As(String)` | `{"As": "<var>"}` — store current stream |
| `Store(String)` | `{"Store": "<var>"}` — alias of `As` |
| `Select(String)` | `{"Select": "<var>"}` — replace stream with a stored var |
| `Inject(String)` | `{"Inject": "<var>"}` — start from or merge with a stored var |

### Ordering (TS: `N` or `X`)

| Step | JSON |
|---|---|
| `OrderBy(String, Order)` | `{"OrderBy": ["<prop>", "Desc"]}` |
| `OrderByMultiple(Vec<(String, Order)>)` | `{"OrderByMultiple": [["priority","Desc"],["name","Asc"]]}` |

### Aggregation (TS: `N`)

| Step | JSON |
|---|---|
| `Group(String)` | `{"Group": "<prop>"}` |
| `GroupCount(String)` | `{"GroupCount": "<prop>"}` |
| `AggregateBy(AggregateFunction, String)` | `{"AggregateBy": ["Sum", "<prop>"]}` |

### Branching

| Step | JSON |
|---|---|
| `Union(Vec<SubTraversal>)` | `{"Union": [<SubTraversal>, ...]}` |
| `Choose { condition, then_traversal, else_traversal }` | `{"Choose": {"condition": <Predicate>, "then_traversal": <SubTraversal>, "else_traversal": <SubTraversal>|null}}` |
| `Coalesce(Vec<SubTraversal>)` | `{"Coalesce": [<SubTraversal>, ...]}` |
| `Optional(SubTraversal)` | `{"Optional": <SubTraversal>}` |

### Repeat

| Step | JSON |
|---|---|
| `Repeat(RepeatConfig)` | `{"Repeat": <RepeatConfig>}` |

### Projections (terminal)

| Step | JSON |
|---|---|
| `Values(Vec<String>)` | `{"Values": ["name", "email"]}` |
| `ValueMap(Option<Vec<String>>)` | `{"ValueMap": ["$id", "name"]}` or `{"ValueMap": null}` |
| `Project(Vec<Projection>)` | `{"Project": [<Projection>, ...]}` — Projection entries are **untagged** |
| `EdgeProperties` (TS: `X`) | `"EdgeProperties"` |

### Terminals (scalar result)

| Step | JSON |
|---|---|
| `Count` | `"Count"` |
| `Exists` | `"Exists"` |
| `Id` | `"Id"` |
| `Label` | `"Label"` |

### Mutations (write-only) — TS: `N` unless noted

| Step | JSON |
|---|---|
| `AddN { label, properties }` (TS: `*` — switches to `N`) | `{"AddN": {"label": "User", "properties": [["name", <PropertyInput>], ...]}}` |
| `AddE { label, to, properties }` (TS: `N`) | `{"AddE": {"label": "FOLLOWS", "to": <NodeRef>, "properties": [[<k>, <PropertyInput>], ...]}}` |
| `SetProperty(String, PropertyInput)` | `{"SetProperty": ["<prop>", <PropertyInput>]}` |
| `RemoveProperty(String)` | `{"RemoveProperty": "<prop>"}` |
| `Drop` | `"Drop"` |
| `DropEdge(NodeRef)` | `{"DropEdge": <NodeRef>}` — deletes ALL edges from current nodes to target |
| `DropEdgeLabeled { to, label }` | `{"DropEdgeLabeled": {"to": <NodeRef>, "label": "<L>"}}` |
| `DropEdgeById(EdgeRef)` (TS: `X`) | `{"DropEdgeById": <EdgeRef>}` — multigraph-safe |

### Indexes (write-only)

| Step | JSON |
|---|---|
| `CreateIndex { spec, if_not_exists }` | `{"CreateIndex": {"spec": <IndexSpec>, "if_not_exists": true}}` |
| `DropIndex { spec }` | `{"DropIndex": {"spec": <IndexSpec>}}` |
| `CreateVectorIndexNodes { label, property, tenant_property? }` | `{"CreateVectorIndexNodes": {"label":"...", "property":"...", "tenant_property":"..."|null}}` |
| `CreateVectorIndexEdges { ... }` | `{"CreateVectorIndexEdges": {...}}` |
| `CreateTextIndexNodes { ... }` | `{"CreateTextIndexNodes": {...}}` |
| `CreateTextIndexEdges { ... }` | `{"CreateTextIndexEdges": {...}}` |

### Reserved / currently no-op

Present in the AST for forward compatibility. Safe to include; the current Helix interpreter treats them as pass-throughs.

| Step | JSON |
|---|---|
| `Fold` | `"Fold"` |
| `Unfold` | `"Unfold"` |
| `Path` | `"Path"` |
| `SimplePath` | `"SimplePath"` |
| `WithSack(PropertyValue)` | `{"WithSack": <PropertyValue>}` |
| `SackSet(String)` | `{"SackSet": "<prop>"}` |
| `SackAdd(String)` | `{"SackAdd": "<prop>"}` |
| `SackGet` | `"SackGet"` |

---

## 11. Virtual Fields

Available in `Values`, `ValueMap`, `Project` (as a `PropertyProjection.source`), and as `Expr::Property` references inside predicates / expressions:

| Field | Where valid | Notes |
|---|---|---|
| `$id` | any node or edge stream | the element's id |
| `$label` | any node or edge stream | the element's label |
| `$distance` | direct hits from `VectorSearchNodes`/`VectorSearchEdges`/`TextSearchNodes`/`TextSearchEdges` | ascending = closer; lost after `Out`/`In`/`Both`/`OutN`/`InN`/`OtherN` |
| `$from`, `$to` | edge streams, including `EdgeProperties` and edge vector/text hits | source and target node ids |

**Rule:** if you need `$distance` in the result, include it in the first terminal projection *before* any traversal step that changes the stream.

## 12. Multitenancy Contract

For `VectorSearch*` / `TextSearch*` and the corresponding indexes:

- **No tenant_property on index + no tenant_value on search:** normal single-tenant behavior.
- **Index has tenant_property + search supplies `tenant_value`:** results scoped to that partition.
- **Index has tenant_property + search omits `tenant_value`:** request fails (tenant required).
- **Index has tenant_property + search supplies an unknown tenant value:** empty result.
- **Writing a vector to a multitenant-indexed property without the tenant property on the node/edge:** write fails.

## 13. Common Foot-Guns

- Using `{"N": {"Id": 644}}` — rejected: `unknown variant 'Id', expected one of 'Ids', 'Var', 'Param'`. Wrap as `{"N": {"Ids": [644]}}`.
- Writing `{"request_type": "Read"}` — rejected: must be lowercase `"read"`.
- Wrapping `Projection` entries: `{"Project": [{"Property": {...}}]}` — the enum is `#[serde(untagged)]`. Emit the inner `PropertyProjection`/`ExprProjection` directly.
- Wrapping top-level parameter values: `"parameters": {"n": {"I64": 25}}` — wrong. That's `PropertyValue` encoding; parameter values use the untagged `DynamicQueryValue`: `"parameters": {"n": 25}`.
- Sending `DateTime` as a plain string with no `parameter_types` entry — the runtime will treat it as a `String`. Always declare `"p": "DateTime"`.
- Setting `Repeat.times: null` **and** leaving `until: null` — the loop is bounded only by `max_depth` (100). Either set `times` or a terminating `until`.
- Using `Contains` / `IsIn` / `Not` / `Compare` / `IsNull` in `n_where` / `e_where` — rejected by `SourcePredicate`. Push them into a `Where` step after the source.
- Mixing a mutation step with `request_type: "read"` — rejected by the gateway.
