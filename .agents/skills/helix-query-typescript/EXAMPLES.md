# Helix Query Authoring — TypeScript Examples

Each numbered scenario corresponds 1:1 with `../helix-query-rust/EXAMPLES.md` and `../helix-query-json-dynamic/EXAMPLES.md`. When moving between TypeScript, Rust, and inline JSON, open the same scenario in each file.

All snippets assume `import { ... } from "@helix-db/helix-db";`. Query builders are plain functions returning a `ReadBatch`/`WriteBatch`. Produce a dynamic request with `builder().toDynamicJson(params, values)` (or `.toDynamicJson()` when there are no parameters), or register the builder in `defineQueries({...})` for a stored bundle.

---

## 1. Count nodes matching label + predicate

```ts
function activeUserCount() {
  return readBatch()
    .varAs("active_count", g().nWithLabel("User").where(Predicate.eq("status", "active")).count())
    .returning(["active_count"]);
}

const body = activeUserCount().toDynamicJson(); // no parameters
```

---

## 2. Read node by indexed property with projection

Literal form:

```ts
function userByIdLiteral() {
  return readBatch()
    .varAs(
      "user",
      g()
        .nWithLabelWhere("User", SourcePredicate.eq("userId", "u-42"))
        .project([
          PropertyProjection.renamed("$id", "id"),
          PropertyProjection.new("userId"),
          PropertyProjection.new("name"),
        ]),
    )
    .returning(["user"]);
}
```

Parameterized form (preferred):

```ts
const userByIdParams = defineParams({ userId: param.string() });

function userById(p = userByIdParams) {
  return readBatch()
    .varAs(
      "user",
      g()
        .nWithLabel("User")
        .where(Predicate.eqParam("userId", "userId"))
        .project([PropertyProjection.renamed("$id", "id"), PropertyProjection.new("name")]),
    )
    .returning(["user"]);
}

const body = userById().toDynamicJson(userByIdParams, { userId: "u-42" });
```

---

## 3. Multi-hop traversal with `dedup` + `limit`

```ts
const fofParams = defineParams({ userId: param.array(param.i64()) });

function friendsOfFriends(p = fofParams) {
  return readBatch()
    .varAs(
      "fof",
      g()
        .n(NodeRef.param("userId"))
        .out("FOLLOWS")
        .out("FOLLOWS")
        .dedup()
        .limit(50)
        .values(["$id", "name"]),
    )
    .returning(["fof"]);
}

const body = friendsOfFriends().toDynamicJson(fofParams, { userId: [1n, 2n] });
```

---

## 4. Vector search with tenant + distance in projection

```ts
const nearestParams = defineParams({
  tenantId: param.string(),
  queryVector: param.array(param.f64()),
  k: param.i64(),
});

function nearestDocuments(p = nearestParams) {
  return readBatch()
    .varAs(
      "hits",
      g()
        .vectorSearchNodesWith(
          "Document",
          "embedding",
          PropertyInput.param("queryVector"),
          Expr.param("k"),
          PropertyInput.param("tenantId"),
        )
        .project([
          PropertyProjection.renamed("$id", "id"),
          PropertyProjection.new("title"),
          PropertyProjection.renamed("$distance", "distance"),
        ]),
    )
    .returning(["hits"]);
}
```

Project `$distance` before any `.out`/`.in`/`.both` — traversal off the hit stream drops the distance metadata.

---

## 5. BM25 text search with post-filter

```ts
const docSearchParams = defineParams({ tenantId: param.string(), q: param.string() });

function documentSearch(p = docSearchParams) {
  return readBatch()
    .varAs(
      "results",
      g()
        .textSearchNodesWith("Document", "body", PropertyInput.param("q"), 50, PropertyInput.param("tenantId"))
        .where(Predicate.eq("published", true))
        .limit(10)
        .project([
          PropertyProjection.renamed("$id", "id"),
          PropertyProjection.new("title"),
          PropertyProjection.renamed("$distance", "score"),
        ]),
    )
    .returning(["results"]);
}
```

---

## 6. `repeat` traversal with `until` + `emitAfter`

```ts
const chainParams = defineParams({ startId: param.array(param.i64()) });

function managementChain(p = chainParams) {
  return readBatch()
    .varAs(
      "chain",
      g()
        .n(NodeRef.param("startId"))
        .repeat(
          RepeatConfig.new(sub().out("REPORTS_TO"))
            .until(Predicate.eq("title", "CEO"))
            .emitAfter()
            .maxDepth(10),
        )
        .project([
          PropertyProjection.renamed("$id", "id"),
          PropertyProjection.new("name"),
          PropertyProjection.new("title"),
        ]),
    )
    .returning(["chain"]);
}
```

---

## 7. `union` of two sub-traversals

```ts
const networkParams = defineParams({ userId: param.array(param.i64()) });

function userNetwork(p = networkParams) {
  return readBatch()
    .varAs(
      "network",
      g()
        .n(NodeRef.param("userId"))
        .union([sub().out("FOLLOWS"), sub().in("FOLLOWS")])
        .dedup()
        .values(["$id", "name"]),
    )
    .returning(["network"]);
}
```

---

## 8. `choose` (conditional traversal)

```ts
const contentParams = defineParams({ userId: param.array(param.i64()) });

function userContent(p = contentParams) {
  return readBatch()
    .varAs(
      "content",
      g()
        .n(NodeRef.param("userId"))
        .choose(Predicate.eq("tier", "premium"), sub().out("HAS_PREMIUM"), sub().out("HAS_FREE"))
        .limit(20)
        .valueMap(["$id", "title"]),
    )
    .returning(["content"]);
}
```

---

## 9. `coalesce` (fallback traversal)

```ts
const teamParams = defineParams({ userId: param.array(param.i64()) });

function preferredTeam(p = teamParams) {
  return readBatch()
    .varAs(
      "team",
      g()
        .n(NodeRef.param("userId"))
        .coalesce([sub().out("PREFERRED_TEAM"), sub().out("PRIMARY_TEAM"), sub().out("MEMBER_OF").limit(1)])
        .values(["$id", "name"]),
    )
    .returning(["team"]);
}
```

---

## 10. `project` with `Expr.case` (computed field)

```ts
function usersWithBucket() {
  return readBatch()
    .varAs(
      "users",
      g()
        .nWithLabel("User")
        .project([
          Projection.property("$id", "id"),
          Projection.property("score", "score"),
          Projection.expr(
            "bucket",
            Expr.case(
              [
                [Predicate.gte("score", 1000), Expr.val("high")],
                [Predicate.gte("score", 100), Expr.val("mid")],
              ],
              Expr.val("low"),
            ),
          ),
        ]),
    )
    .returning(["users"]);
}
```

---

## 11. Aggregation: `groupCount` and `aggregateBy`

```ts
function usersByStatus() {
  return readBatch()
    .varAs("by_status", g().nWithLabel("User").groupCount("status"))
    .returning(["by_status"]);
}

function totalRevenue() {
  return readBatch()
    .varAs("revenue", g().nWithLabel("Order").aggregateBy(AggregateFunction.Sum, "price"))
    .returning(["revenue"]);
}
```

---

## 12. Write: `addN` + `addE` in one batch with cross-entry `Var` reference

```ts
const createUserParams = defineParams({
  userId: param.string(),
  name: param.string(),
  postId: param.array(param.i64()),
});

function createUserAndLinkPost(p = createUserParams) {
  return writeBatch()
    .varAs(
      "newUser",
      g()
        .addN("User", {
          userId: PropertyInput.param("userId"),
          name: PropertyInput.param("name"),
          createdAt: PropertyInput.expr(Expr.timestamp()),
        })
        .project([PropertyProjection.renamed("$id", "id")]),
    )
    .varAs("link", g().n(NodeRef.param("postId")).addE("CREATED_BY", NodeRef.var("newUser"), {}))
    .returning(["newUser", "link"]);
}
```

---

## 13. Write: upsert via `varAsIf`

```ts
const upsertParams = defineParams({ userId: param.string(), name: param.string() });

function upsertUser(p = upsertParams) {
  return writeBatch()
    .varAs("existing", g().nWithLabel("User").where(Predicate.eqParam("userId", "userId")))
    .varAsIf(
      "updated",
      BatchCondition.varNotEmpty("existing"),
      g().n(NodeRef.var("existing")).setProperty("name", PropertyInput.param("name")),
    )
    .varAsIf(
      "created",
      BatchCondition.varEmpty("existing"),
      g().addN("User", { userId: PropertyInput.param("userId"), name: PropertyInput.param("name") }),
    )
    .returning(["updated", "created"]);
}
```

---

## 14. Write: `forEachParam` over an array of objects

```ts
const bulkParams = defineParams({ data: param.array(param.object(param.value())) });

function bulkCreateUsers(p = bulkParams) {
  const body = writeBatch().varAs(
    "created",
    g().addN("User", {
      externalId: PropertyInput.param("externalId"),
      embedding: PropertyInput.param("embedding"),
    }),
  );
  return writeBatch().forEachParam("data", body).returning(["created"]);
}
```

Inside `body`, parameter names resolve against each object's fields. `param.array(param.object(param.value()))` records the parameter as `{"Array": "Object"}` on the wire — exactly the Rust `QueryParamType::Array(Box::new(QueryParamType::Object))`.

---

## 15. Typed-array parameter + `DateTime` parameter

```ts
const filteredParams = defineParams({
  statuses: param.array(param.string()),
  since: param.dateTime(),
});

function usersFiltered(p = filteredParams) {
  return readBatch()
    .varAs(
      "users",
      g()
        .nWithLabel("User")
        .where(Predicate.and([Predicate.isInParam("status", "statuses"), Predicate.gteParam("createdAt", "since")]))
        .values(["$id", "status", "createdAt"]),
    )
    .returning(["users"]);
}

const body = usersFiltered().toDynamicJson(filteredParams, {
  statuses: ["active", "pending"],
  since: DateTime.parseRfc3339("2026-04-05T10:00:00Z"),
});
```

`statuses` records as `{"Array": "String"}` and `since` as `"DateTime"`. Pass a `DateTime`; the request normalizes to UTC RFC3339 with millisecond precision before serializing.

---

## 16. Write: index management

```ts
function bootstrapIndexes() {
  return writeBatch()
    .varAs("idx_userId", g().createIndexIfNotExists(IndexSpec.nodeUniqueEquality("User", "userId")))
    .varAs("idx_embedding", g().createIndexIfNotExists(IndexSpec.nodeVector("Document", "embedding", "tenantId")))
    .varAs("idx_body", g().createIndexIfNotExists(IndexSpec.nodeText("Document", "body", "tenantId")))
    .returning(["idx_userId", "idx_embedding", "idx_body"]);
}
```

Drop an index with `g().dropIndex(IndexSpec....)`. The convenience methods (`createVectorIndexNodes`, etc.) produce identical wire output — prefer `createIndexIfNotExists` + `IndexSpec` for consistency with the dynamic JSON reference.

---

## 17. Warm a read route

Warming uses the *same* query body; the header (`X-Helix-Warm: true`) is applied on the HTTP client. Build the request and let callers decide to warm:

```ts
const body = userById().toDynamicJson(userByIdParams, { userId: "u-42" });
// Send via fetch / curl / etc:
//   POST /v1/query
//   X-Helix-Warm: true
//   Content-Type: application/json
//   <body>
// A successful warm returns 204 No Content. Writes reject warming.
```

Warming is strictly read-only; a `WriteBatch` with `X-Helix-Warm: true` is rejected by the gateway.

---

## Registering a stored bundle

Any of the parameterized builders above can be registered into a `queries.json` bundle instead of (or in addition to) being called dynamically:

```ts
export const queries = defineQueries({
  read: {
    user_by_id: registerRead(userById, userByIdParams),
    nearest_documents: registerRead(nearestDocuments, nearestParams),
  },
  write: {
    upsert_user: registerWrite(upsertUser, upsertParams),
    bootstrap_indexes: registerWrite(bootstrapIndexes, defineParams({})),
  },
});

queries.call.user_by_id({ userId: "u-42" }); // -> DynamicQueryRequest
await queries.generate("queries.json");       // bundle, version 4
```

Route names must be unique across read and write routes — duplicates throw `GenerateError`.
