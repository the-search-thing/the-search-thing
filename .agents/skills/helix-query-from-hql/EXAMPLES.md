# HQL → Rust DSL / TypeScript DSL — Worked Migrations

Each scenario shows the legacy **HQL** source, the **goal**, then the **Rust DSL** and **TypeScript DSL**
translations.

- **Rust** assumes `use helix_db::dsl::prelude::*;`. Query bodies are shown as bare `read_batch()`/`write_batch()`
  expressions using explicit parameter references (`NodeRef::param`, `Predicate::eq_param`, `Expr::param`,
  `PropertyInput::param`). To bundle one as a stored route, wrap the body in a `#[register] fn` and run
  `helix_db::generate()`; serialize a single query with `req.to_json_string()`.
- **TypeScript** assumes `import { ... } from "@helix-db/helix-db";`. Builders are plain functions returning a
  `ReadBatch`/`WriteBatch`. Produce a request with `builder().toDynamicJson(params, values)` (or `.toDynamicJson()`
  with no params), or register in `defineQueries({...})` for a stored bundle.

Recurring spelling traps: Rust `.in_(Some("X"))` / `.where_(...)` vs TS `.in("X")` / `.where(...)`; `::`
constructors in Rust vs `.` in TS; `Some()/None::<&str>` vs `"X"/null`; integer params are `bigint` (`1n`) in TS.

See `../helix-query-rust/EXAMPLES.md` and `../helix-query-typescript/EXAMPLES.md` for non-migration patterns.

---

## 1. Read a node by ID

```helixql
QUERY GetUser(user_id: ID) =>
    user <- N<User>(user_id)
    RETURN user
```

**Goal:** fetch one user by id.

```rust
read_batch()
    .var_as("user", g().n(NodeRef::param("user_id")))
    .returning(["user"])
```

```ts
const getUserParams = defineParams({ userId: param.string() });

function getUser(_ = getUserParams) {
  return readBatch()
    .varAs("user", g().n(NodeRef.param("userId")))
    .returning(["user"]);
}

const body = getUser().toDynamicJson(getUserParams, { userId: "u-42" });
```

> HQL `ID` becomes `String` (Rust) / `param.string()` (TS). Anchoring on the param id is the narrowest anchor.

---

## 2. Indexed-property lookup with projection

```helixql
QUERY GetByHandle(handle: String) =>
    user <- N<User>({handle: handle})
    RETURN user::{userID: ::ID, name, handle}
```

**Goal:** look up a user by an indexed property and return a renamed-id shape.

```rust
read_batch()
    .var_as(
        "user",
        g().n_with_label("User")
            .where_(Predicate::eq_param("handle", "handle"))
            .project(vec![
                PropertyProjection::renamed("$id", "userID"),
                PropertyProjection::new("name"),
                PropertyProjection::new("handle"),
            ]),
    )
    .returning(["user"])
```

```ts
const getByHandleParams = defineParams({ handle: param.string() });

function getByHandle(_ = getByHandleParams) {
  return readBatch()
    .varAs(
      "user",
      g()
        .nWithLabel("User")
        .where(Predicate.eqParam("handle", "handle"))
        .project([
          PropertyProjection.renamed("$id", "userID"),
          PropertyProjection.new("name"),
          PropertyProjection.new("handle"),
        ]),
    )
    .returning(["user"]);
}

const body = getByHandle().toDynamicJson(getByHandleParams, { handle: "alice" });
```

> HQL `N<User>({handle: ...})` is an indexed lookup. For a constant value, anchor with a **source predicate**
> (`g().n_where(SourcePredicate::eq("handle", value))` / `g().nWhere(SourcePredicate.eq(...))`, index-friendly).
> For a parameter, `n_with_label(..).where(eq_param(..))` as above. HQL `::ID` is the virtual field `$id`;
> `userID: ::ID` becomes `PropertyProjection::renamed("$id", "userID")`.

---

## 3. Multi-hop traversal with property selection

```helixql
QUERY GetFollowing(user_id: ID) =>
    following <- N<User>(user_id)::Out<Follows>::Out<Follows>
    RETURN following::{name, handle}
```

**Goal:** friends-of-friends, projected.

```rust
read_batch()
    .var_as(
        "following",
        g().n(NodeRef::param("user_id"))
            .out(Some("Follows"))
            .out(Some("Follows"))
            .dedup()
            .value_map(Some(vec!["name", "handle"])),
    )
    .returning(["following"])
```

```ts
const getFollowingParams = defineParams({ userId: param.string() });

function getFollowing(_ = getFollowingParams) {
  return readBatch()
    .varAs(
      "following",
      g()
        .n(NodeRef.param("userId"))
        .out("Follows")
        .out("Follows")
        .dedup()
        .valueMap(["name", "handle"]),
    )
    .returning(["following"]);
}

const body = getFollowing().toDynamicJson(getFollowingParams, { userId: "u-42" });
```

> Add `dedup()` for two-hop traversals — the same node is often reachable by multiple paths. HQL did not dedup
> implicitly, so only add it if the intent is distinct results.

---

## 4. Edge-object traversal to an endpoint

```helixql
QUERY GetCreator(creation_id: ID) =>
    creator <- E<Creates>(creation_id)::FromN
    RETURN creator
```

**Goal:** from a `Creates` edge, get the source node.

```rust
read_batch()
    .var_as("creator", g().e(EdgeRef::param("creation_id")).in_n())
    .returning(["creator"])
```

```ts
const getCreatorParams = defineParams({ creationId: param.string() });

function getCreator(_ = getCreatorParams) {
  return readBatch()
    .varAs("creator", g().e(EdgeRef.param("creationId")).inN())
    .returning(["creator"]);
}

const body = getCreator().toDynamicJson(getCreatorParams, { creationId: "e-9" });
```

> `::FromN` (edge → source) is `.in_n()` / `.inN()`; `::ToN` (edge → target) is `.out_n()` / `.outN()`. Easy to
> invert — `From` is the *incoming* side from the edge's perspective.

---

## 5. Filtered scan with compound predicate, order, and range

```helixql
QUERY ActiveAdults(status: String, min_age: U8) =>
    users <- N<User>::WHERE(AND(_::{status}::EQ(status), _::{age}::GTE(min_age)))::ORDER<Desc>(_::{age})::RANGE(0, 20)
    RETURN users::{name, age, status}
```

**Goal:** filter, sort, paginate, project.

```rust
read_batch()
    .var_as(
        "users",
        g().n_with_label("User")
            .where_(Predicate::and(vec![
                Predicate::eq_param("status", "status"),
                Predicate::gte_param("age", "min_age"),
            ]))
            .order_by("age", Order::Desc)
            .range(0, 20)
            .project(vec![
                PropertyProjection::new("name"),
                PropertyProjection::new("age"),
                PropertyProjection::new("status"),
            ]),
    )
    .returning(["users"])
```

```ts
const activeAdultsParams = defineParams({ status: param.string(), minAge: param.i64() });

function activeAdults(_ = activeAdultsParams) {
  return readBatch()
    .varAs(
      "users",
      g()
        .nWithLabel("User")
        .where(
          Predicate.and([
            Predicate.eqParam("status", "status"),
            Predicate.gteParam("age", "minAge"),
          ]),
        )
        .orderBy("age", Order.Desc)
        .range(0, 20)
        .project([
          PropertyProjection.new("name"),
          PropertyProjection.new("age"),
          PropertyProjection.new("status"),
        ]),
    )
    .returning(["users"]);
}

const body = activeAdults().toDynamicJson(activeAdultsParams, { status: "active", minAge: 18n });
```

> HQL widths (`U8`) collapse to `i64`/`param.i64()`. `RANGE(0,20)` maps 1:1 to `.range(0,20)`. Note the TS param
> is a `bigint` (`18n`).

---

## 6. Membership filter (`IS_IN`) and string `CONTAINS`

```helixql
QUERY SearchUsers(statuses: [String], term: String) =>
    users <- N<User>::WHERE(AND(_::{status}::IS_IN(statuses), _::{bio}::CONTAINS(term)))
    RETURN users::{name}
```

**Goal:** combine an array-membership filter with a substring filter.

```rust
read_batch()
    .var_as(
        "users",
        g().n_with_label("User")
            .where_(Predicate::and(vec![
                Predicate::is_in_param("status", "statuses"),
                Predicate::contains_param("bio", "term"),
            ]))
            .value_map(Some(vec!["name"])),
    )
    .returning(["users"])
```

```ts
const searchUsersParams = defineParams({ statuses: param.array(param.string()), term: param.string() });

function searchUsers(_ = searchUsersParams) {
  return readBatch()
    .varAs(
      "users",
      g()
        .nWithLabel("User")
        .where(
          Predicate.and([
            Predicate.isInParam("status", "statuses"),
            Predicate.containsParam("bio", "term"),
          ]),
        )
        .valueMap(["name"]),
    )
    .returning(["users"]);
}

const body = searchUsers().toDynamicJson(searchUsersParams, { statuses: ["active", "pending"], term: "graph" });
```

---

## 7. Group-by counts vs aggregate-by objects

```helixql
QUERY UsersByCountry() =>
    users <- N<User>
    RETURN users::GROUP_BY(country)
```

**Goal:** count users per country.

```rust
read_batch()
    .var_as("users", g().n_with_label("User").group_count("country"))
    .returning(["users"])
```

```ts
function usersByCountry() {
  return readBatch()
    .varAs("users", g().nWithLabel("User").groupCount("country"))
    .returning(["users"]);
}

const body = usersByCountry().toDynamicJson();
```

> HQL `GROUP_BY` returns count summaries → `group_count`/`groupCount`. HQL `AGGREGATE_BY` (which returns the full
> grouped objects) → `group`/`group`. For numeric rollups like `AVG(score)` use
> `.aggregate_by(AggregateFunction::Mean, "score")` (HQL `AVG` is `Mean`).

---

## 8. Vector search (precomputed vector, tenant-scoped)

```helixql
QUERY FindDocs(vector: [F64], k: I64) =>
    docs <- SearchV<Document>(vector, k)
    RETURN docs::{docID: ::ID, content}
```

**Goal:** top-k nearest documents for a precomputed query vector, scoped to a tenant.

```rust
read_batch()
    .var_as(
        "docs",
        g().vector_search_nodes_with(
            "Document",
            "embedding",
            PropertyInput::param("vector"),
            Expr::param("k"),
            Some(PropertyInput::param("tenant_id")),
        )
        .project(vec![
            PropertyProjection::renamed("$id", "docID"),
            PropertyProjection::renamed("$distance", "distance"),
            PropertyProjection::new("content"),
        ]),
    )
    .returning(["docs"])
```

```ts
const findDocsParams = defineParams({
  vector: param.array(param.f64()),
  k: param.i64(),
  tenantId: param.string(),
});

function findDocs(_ = findDocsParams) {
  return readBatch()
    .varAs(
      "docs",
      g()
        .vectorSearchNodesWith(
          "Document",
          "embedding",
          PropertyInput.param("vector"),
          Expr.param("k"),
          PropertyInput.param("tenantId"),
        )
        .project([
          PropertyProjection.renamed("$id", "docID"),
          PropertyProjection.renamed("$distance", "distance"),
          PropertyProjection.new("content"),
        ]),
    )
    .returning(["docs"]);
}

const body = findDocs().toDynamicJson(findDocsParams, { vector: [0.1, 0.2, 0.3], k: 10n, tenantId: "acme" });
```

> Use the **`_with`/`...With`** search variants for runtime params (vector, `k`, tenant). The plain
> `vector_search_nodes`/`vectorSearchNodes` take concrete values (a literal `Vec<f32>`/`number[]`), so a param
> name passed there would be treated as a literal. Two migration musts: the vector is **precomputed** (HQL
> `Embed(...)` is unsupported — see scenario 15), and carry the tenant value if the original route was
> tenant-scoped. Project `$distance` at the search step — it is gone after any further hop.

---

## 9. BM25 keyword search

```helixql
QUERY SearchDocs(keywords: String, k: I64) =>
    docs <- SearchBM25<Document>(keywords, k)
    RETURN docs
```

**Goal:** full-text search over an indexed text property.

```rust
read_batch()
    .var_as(
        "docs",
        g().text_search_nodes_with(
            "Document",
            "content",
            PropertyInput::param("keywords"),
            Expr::param("k"),
            None::<PropertyInput>,
        ),
    )
    .returning(["docs"])
```

```ts
const searchDocsParams = defineParams({ keywords: param.string(), k: param.i64() });

function searchDocs(_ = searchDocsParams) {
  return readBatch()
    .varAs(
      "docs",
      g().textSearchNodesWith("Document", "content", PropertyInput.param("keywords"), Expr.param("k"), null),
    )
    .returning(["docs"]);
}

const body = searchDocs().toDynamicJson(searchDocsParams, { keywords: "machine learning", k: 5n });
```

> The property argument (`"content"`) must be the BM25-indexed text field. Pass `None`/`null` for tenant when the
> route is not tenant-scoped.

---

## 10. Create a node, then an edge to it (write batch)

```helixql
QUERY CreateFollow(name: String, target_id: ID) =>
    user <- AddN<User>({name: name})
    edge <- AddE<Follows>::From(user)::To(target_id)
    RETURN user, edge
```

**Goal:** add a user and link it to an existing node.

```rust
write_batch()
    .var_as("user", g().add_n("User", vec![("name", PropertyInput::param("name"))]))
    .var_as(
        "edge",
        g().n(NodeRef::var("user"))
            .add_e("Follows", NodeRef::param("target_id"), vec![]),
    )
    .returning(["user", "edge"])
```

```ts
const createFollowParams = defineParams({ name: param.string(), targetId: param.string() });

function createFollow(_ = createFollowParams) {
  return writeBatch()
    .varAs("user", g().addN("User", { name: PropertyInput.param("name") }))
    .varAs(
      "edge",
      g().n(NodeRef.var("user")).addE("Follows", NodeRef.param("targetId"), {}),
    )
    .returning(["user", "edge"]);
}

const body = createFollow().toDynamicJson(createFollowParams, { name: "Alice", targetId: "u-7" });
```

> `add_e` is a step on the **From** node; the **To** node is the second argument. Note this is a `write_batch`
> because it mutates — using `read_batch` would fail to compile.

---

## 11. Update properties

```helixql
QUERY RenameUser(user_id: ID, new_name: String) =>
    updated <- N<User>(user_id)::UPDATE({name: new_name})
    RETURN updated
```

**Goal:** change one property on an existing node.

```rust
write_batch()
    .var_as(
        "updated",
        g().n(NodeRef::param("user_id")).set_property("name", PropertyInput::param("new_name")),
    )
    .returning(["updated"])
```

```ts
const renameUserParams = defineParams({ userId: param.string(), newName: param.string() });

function renameUser(_ = renameUserParams) {
  return writeBatch()
    .varAs("updated", g().n(NodeRef.param("userId")).setProperty("name", PropertyInput.param("newName")))
    .returning(["updated"]);
}

const body = renameUser().toDynamicJson(renameUserParams, { userId: "u-42", newName: "Alicia" });
```

> One `set_property`/`setProperty` per field; chain calls for several. Omitted fields stay unchanged, matching
> HQL `UPDATE` semantics.

---

## 12. Delete a node

```helixql
QUERY DeleteUser(user_id: ID) =>
    DROP N<User>(user_id)
    RETURN "Removed"
```

**Goal:** drop a node and its edges.

```rust
write_batch()
    .var_as("dropped", g().n(NodeRef::param("user_id")).drop())
    .returning(["dropped"])
```

```ts
const deleteUserParams = defineParams({ userId: param.string() });

function deleteUser(_ = deleteUserParams) {
  return writeBatch()
    .varAs("dropped", g().n(NodeRef.param("userId")).drop())
    .returning(["dropped"]);
}

const body = deleteUser().toDynamicJson(deleteUserParams, { userId: "u-42" });
```

> HQL `RETURN "Removed"` (a literal) has no DSL form — return the dropped binding (or `.returning([])` for no
> payload) instead. Dropping a node removes its connected edges. To drop only edges, traverse to them and use
> `drop_edge_by_id`/`dropEdgeById` (multigraph-safe).

---

## 13. Iterate an array parameter (`FOR ... IN`)

```helixql
QUERY CreateUsers(users: [{name: String}]) =>
    FOR {name} IN users {
        AddN<User>({name: name})
    }
    RETURN NONE
```

**Goal:** create one node per element of an array parameter.

```rust
let body = write_batch()
    .var_as("u", g().add_n("User", vec![("name", PropertyInput::param("name"))]));

write_batch()
    .for_each_param("users", body)
    .returning([])
```

```ts
const createUsersParams = defineParams({ users: param.array(param.object(param.string())) });

function createUsers(_ = createUsersParams) {
  const body = writeBatch().varAs("u", g().addN("User", { name: PropertyInput.param("name") }));
  return writeBatch().forEachParam("users", body).returning([]);
}

const body = createUsers().toDynamicJson(createUsersParams, { users: [{ name: "Alice" }, { name: "Bob" }] });
```

> `for_each_param`/`forEachParam` iterates the objects of an **array parameter** — it is not a general loop. The
> body is its own batch that reads each element's fields by name. Use the HQL destructuring form (`FOR {name} IN`,
> array-of-objects) for a clean mapping; an array-of-scalars `FOR name IN` does not map directly. `RETURN NONE` →
> `.returning([])`.

---

## 14. Relationship-existence filter — UNSUPPORTED as a predicate

```helixql
QUERY UsersWithFollowers() =>
    users <- N<User>::WHERE(EXISTS(_::In<Follows>))
    RETURN users::{name}
```

**Goal:** users that have at least one follower.

`Predicate` is property-only, so `WHERE(EXISTS(_::In<Follows>))` has **no inline predicate form**. Stage the set
of followed users (targets of `Follows` edges) and intersect with `.within`, or filter app-side:

```rust
read_batch()
    // every node that is the target of a Follows edge (i.e. has a follower)
    .var_as("followed", g().e_with_label("Follows").out_n().dedup())
    .var_as(
        "users",
        g().n_with_label("User").within("followed").value_map(Some(vec!["name"])),
    )
    .returning(["users"])
```

```ts
function usersWithFollowers() {
  return readBatch()
    .varAs("followed", g().eWithLabel("Follows").outN().dedup())
    .varAs("users", g().nWithLabel("User").within("followed").valueMap(["name"]))
    .returning(["users"]);
}

const body = usersWithFollowers().toDynamicJson();
```

> Flag this in the migration: HQL `EXISTS`/`!EXISTS` and count-based `WHERE` (e.g.
> `WHERE(_::In<Follows>::COUNT::GT(100))`) are not predicates. Use `.within(var)` / `.without(var)` set ops where
> they fit, otherwise compute the condition in application code. `.exists()` only produces a terminal boolean on
> its own binding — it is not a filter.

---

## 15. Inline embedding + reranking + upsert — UNSUPPORTED, split app/DSL

```helixql
#[model("openai:text-embedding-ada-002")]
QUERY UpsertAndSearch(content: String, k: I64) =>
    doc <- N<Document>::WHERE(_::{content}::EQ(content))::UpsertV(Embed(content), {content: content})
    hits <- SearchV<Document>(Embed(content), k)::RerankRRF
    RETURN hits
```

**Goal:** embed text, upsert a document, then a reranked similarity search.

Four HQL features here have **no DSL equivalent**: the `#[model]` macro, `Embed(...)`, `UpsertV`, and
`::RerankRRF`. Translate only the supported core; do the rest in app code.

**App code (outside the DSL):**
1. Embed `content` with your model → `vector` (replaces `Embed` and `#[model]`).
2. Upsert = read-then-branch: query by `content`; if found, `set_property` the vector/fields, else `add_n` with
   the vector (replaces `UpsertV`).
3. After the search returns ranked hits, apply RRF/MMR fusion in the application (replaces `::RerankRRF`).

**Supported DSL core — the similarity search with the app-provided vector:**

```rust
read_batch()
    .var_as(
        "hits",
        g().vector_search_nodes_with(
            "Document",
            "embedding",
            PropertyInput::param("vector"),
            Expr::param("k"),
            None::<PropertyInput>,
        )
        .project(vec![
            PropertyProjection::renamed("$id", "docID"),
            PropertyProjection::renamed("$distance", "distance"),
            PropertyProjection::new("content"),
        ]),
    )
    .returning(["hits"])
```

```ts
const searchSimilarParams = defineParams({ vector: param.array(param.f64()), k: param.i64() });

function searchSimilar(_ = searchSimilarParams) {
  return readBatch()
    .varAs(
      "hits",
      g()
        .vectorSearchNodesWith("Document", "embedding", PropertyInput.param("vector"), Expr.param("k"), null)
        .project([
          PropertyProjection.renamed("$id", "docID"),
          PropertyProjection.renamed("$distance", "distance"),
          PropertyProjection.new("content"),
        ]),
    )
    .returning(["hits"]);
}

const body = searchSimilar().toDynamicJson(searchSimilarParams, { vector: [0.1, 0.2, 0.3], k: 10n });
```

> Always tell the user which parts moved to app code and why, rather than inventing a DSL shape for an
> unsupported feature. For a hybrid recall (vector + BM25 + app-side RRF) pattern, see the `helix-memory-system`
> skill.

---

## Verifying these migrations

Run the loop from `REFERENCE.md` §Verification: **compile** (`cargo build`/`tsc`), **AST parity** (diff
`req.to_json_string()` against `batch.toDynamicJson(params, values)` — identical JSON means the two translations
agree and match the wire format), then **run** both against the same dataset as the original HQL and compare row
counts, ordering, and projected fields.
