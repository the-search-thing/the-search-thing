# Helix Dynamic Query — JSON Examples

Copy the closest scenario and adapt labels, properties, and parameters. Every example is a complete body for `POST /v1/query`. Encoding rules are in `REFERENCE.md`; authoring style rules are in `SKILL.md`.

---

## 1. Count nodes matching label + predicate

**Goal:** how many active users are there?

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "active_count",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"Where": {"Eq": ["status", {"String": "active"}]}},
          "Count"
        ],
        "condition": null
      }}
    ],
    "returns": ["active_count"]
  }
}
```

Response: `{"active_count": <number>}`.

---

## 2. Read node by indexed property with projection

**Goal:** load a single User by `userId`, return three properties with a renamed id.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "user",
        "steps": [
          {"NWhere": {"And": [
            {"Eq": ["$label", {"String": "User"}]},
            {"Eq": ["userId", {"String": "u-42"}]}
          ]}},
          {"Project": [
            {"source": "$id", "alias": "id"},
            {"source": "userId", "alias": "userId"},
            {"source": "name", "alias": "name"}
          ]}
        ],
        "condition": null
      }}
    ],
    "returns": ["user"]
  }
}
```

Parameterized form (prefer this for reusable routes):

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "user",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"Where": {"Compare": {
            "left": {"Property": "userId"},
            "op": "Eq",
            "right": {"Param": "userId"}
          }}},
          {"Project": [
            {"source": "$id", "alias": "id"},
            {"source": "name", "alias": "name"}
          ]}
        ],
        "condition": null
      }}
    ],
    "returns": ["user"]
  },
  "parameters":      {"userId": "u-42"},
  "parameter_types": {"userId": "String"}
}
```

---

## 3. Multi-hop traversal with `dedup` + `limit`

**Goal:** starting from a user id param, find users two hops out via `FOLLOWS`, deduplicate, cap at 50.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "fof",
        "steps": [
          {"N": {"Param": "userId"}},
          {"Out": "FOLLOWS"},
          {"Out": "FOLLOWS"},
          "Dedup",
          {"Limit": 50},
          {"Values": ["$id", "name"]}
        ],
        "condition": null
      }}
    ],
    "returns": ["fof"]
  },
  "parameters":      {"userId": [42]},
  "parameter_types": {"userId": {"Array": "I64"}}
}
```

---

## 4. Vector search with tenant + distance in projection

**Goal:** 5 nearest documents to a query embedding, scoped by tenant, returning id/title/distance.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "hits",
        "steps": [
          {"VectorSearchNodes": {
            "label": "Document",
            "property": "embedding",
            "tenant_value": {"Expr": {"Param": "tenantId"}},
            "query_vector": {"Expr": {"Param": "queryVector"}},
            "k": {"Expr": {"Param": "k"}}
          }},
          {"Project": [
            {"source": "$id", "alias": "id"},
            {"source": "title", "alias": "title"},
            {"source": "$distance", "alias": "distance"}
          ]}
        ],
        "condition": null
      }}
    ],
    "returns": ["hits"]
  },
  "parameters": {
    "tenantId": "acme",
    "queryVector": [0.12, 0.44, 0.91],
    "k": 5
  },
  "parameter_types": {
    "tenantId": "String",
    "queryVector": {"Array": "F64"},
    "k": "I64"
  }
}
```

`$distance` ascends (smaller = closer). Project it before any `Out`/`In`/`Both` step or you lose it.

---

## 5. BM25 text search with post-filter

**Goal:** BM25 over `Document.body`, over-fetch 50, keep only the published ones in the tenant, cap at 10.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "results",
        "steps": [
          {"TextSearchNodes": {
            "label": "Document",
            "property": "body",
            "tenant_value": {"Expr": {"Param": "tenantId"}},
            "query_text": {"Expr": {"Param": "q"}},
            "k": {"Literal": 50}
          }},
          {"Where": {"Eq": ["published", {"Bool": true}]}},
          {"Limit": 10},
          {"Project": [
            {"source": "$id", "alias": "id"},
            {"source": "title", "alias": "title"},
            {"source": "$distance", "alias": "score"}
          ]}
        ],
        "condition": null
      }}
    ],
    "returns": ["results"]
  },
  "parameters":      {"tenantId": "acme", "q": "knowledge graph"},
  "parameter_types": {"tenantId": "String", "q": "String"}
}
```

---

## 6. `Repeat` traversal with `until` + `emit_after`

**Goal:** crawl outwards via `REPORTS_TO`, emitting each level, stopping when the title is "CEO" or depth hits 10.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "chain",
        "steps": [
          {"N": {"Param": "startId"}},
          {"Repeat": {
            "traversal": {"steps": [{"Out": "REPORTS_TO"}]},
            "times": null,
            "until": {"Eq": ["title", {"String": "CEO"}]},
            "emit": "After",
            "emit_predicate": null,
            "max_depth": 10
          }},
          {"Project": [
            {"source": "$id", "alias": "id"},
            {"source": "name", "alias": "name"},
            {"source": "title", "alias": "title"}
          ]}
        ],
        "condition": null
      }}
    ],
    "returns": ["chain"]
  },
  "parameters":      {"startId": [1]},
  "parameter_types": {"startId": {"Array": "I64"}}
}
```

---

## 7. `Union` of two sub-traversals

**Goal:** merge direct followers and followees of a user.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "network",
        "steps": [
          {"N": {"Param": "userId"}},
          {"Union": [
            {"steps": [{"Out": "FOLLOWS"}]},
            {"steps": [{"In": "FOLLOWS"}]}
          ]},
          "Dedup",
          {"Values": ["$id", "name"]}
        ],
        "condition": null
      }}
    ],
    "returns": ["network"]
  },
  "parameters":      {"userId": [42]},
  "parameter_types": {"userId": {"Array": "I64"}}
}
```

---

## 8. `Choose` (conditional traversal)

**Goal:** for premium users, walk to `PremiumContent`; otherwise walk to `FreeContent`.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "content",
        "steps": [
          {"N": {"Param": "userId"}},
          {"Choose": {
            "condition": {"Eq": ["tier", {"String": "premium"}]},
            "then_traversal": {"steps": [{"Out": "HAS_PREMIUM"}]},
            "else_traversal": {"steps": [{"Out": "HAS_FREE"}]}
          }},
          {"Limit": 20},
          {"ValueMap": ["$id", "title"]}
        ],
        "condition": null
      }}
    ],
    "returns": ["content"]
  },
  "parameters":      {"userId": [42]},
  "parameter_types": {"userId": {"Array": "I64"}}
}
```

---

## 9. `Coalesce` (fallback traversal)

**Goal:** prefer the user's preferred team, fall back to primary team, fall back to any team.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "team",
        "steps": [
          {"N": {"Param": "userId"}},
          {"Coalesce": [
            {"steps": [{"Out": "PREFERRED_TEAM"}]},
            {"steps": [{"Out": "PRIMARY_TEAM"}]},
            {"steps": [{"Out": "MEMBER_OF"}, {"Limit": 1}]}
          ]},
          {"Values": ["$id", "name"]}
        ],
        "condition": null
      }}
    ],
    "returns": ["team"]
  },
  "parameters":      {"userId": [42]},
  "parameter_types": {"userId": {"Array": "I64"}}
}
```

---

## 10. `Project` with `Expr::Case` (computed field)

**Goal:** user list plus a `bucket` column derived from `score`.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "users",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"Project": [
            {"source": "$id", "alias": "id"},
            {"source": "score", "alias": "score"},
            {
              "alias": "bucket",
              "expr": {
                "Case": {
                  "when_then": [
                    [{"Gte": ["score", {"I64": 1000}]}, {"Constant": {"String": "high"}}],
                    [{"Gte": ["score", {"I64": 100}]},  {"Constant": {"String": "mid"}}]
                  ],
                  "else_expr": {"Constant": {"String": "low"}}
                }
              }
            }
          ]}
        ],
        "condition": null
      }}
    ],
    "returns": ["users"]
  }
}
```

Note the `Project` entries — **no `{"Property": ...}` / `{"Expr": ...}` wrapper**; `Projection` is untagged.

---

## 11. Aggregation: `Group` + `GroupCount`

**Goal:** count users per status.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "by_status",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"GroupCount": "status"}
        ],
        "condition": null
      }}
    ],
    "returns": ["by_status"]
  }
}
```

Sum of `price` across `Order` nodes:

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "revenue",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "Order"}]}},
          {"AggregateBy": ["Sum", "price"]}
        ],
        "condition": null
      }}
    ],
    "returns": ["revenue"]
  }
}
```

---

## 12. Write: `AddN` + `AddE` in one batch with cross-entry `Var` reference

**Goal:** create a user, then create a `CREATED_BY` edge from an existing `Post` to the new user.

```json
{
  "request_type": "write",
  "query": {
    "queries": [
      {"Query": {
        "name": "newUser",
        "steps": [
          {"AddN": {
            "label": "User",
            "properties": [
              ["userId", {"Expr": {"Param": "userId"}}],
              ["name",   {"Expr": {"Param": "name"}}],
              ["createdAt", {"Expr": "Timestamp"}]
            ]
          }},
          {"Project": [{"source": "$id", "alias": "id"}]}
        ],
        "condition": null
      }},
      {"Query": {
        "name": "link",
        "steps": [
          {"N": {"Param": "postId"}},
          {"AddE": {
            "label": "CREATED_BY",
            "to": {"Var": "newUser"},
            "properties": []
          }}
        ],
        "condition": null
      }}
    ],
    "returns": ["newUser", "link"]
  },
  "parameters":      {"userId": "u-42", "name": "Alice", "postId": [101]},
  "parameter_types": {"userId": "String", "name": "String", "postId": {"Array": "I64"}}
}
```

`{"Expr": "Timestamp"}` is `PropertyInput::Expr(Expr::Timestamp)` — sets the property to the server's UTC epoch millis at write time.

---

## 13. Write: upsert via `VarNotEmpty` / `VarEmpty` conditions

**Goal:** find user by `userId`; if exists, update `name`; otherwise create.

```json
{
  "request_type": "write",
  "query": {
    "queries": [
      {"Query": {
        "name": "existing",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"Where": {"Compare": {
            "left": {"Property": "userId"}, "op": "Eq", "right": {"Param": "userId"}
          }}}
        ],
        "condition": null
      }},
      {"Query": {
        "name": "updated",
        "steps": [
          {"N": {"Var": "existing"}},
          {"SetProperty": ["name", {"Expr": {"Param": "name"}}]}
        ],
        "condition": {"VarNotEmpty": "existing"}
      }},
      {"Query": {
        "name": "created",
        "steps": [
          {"AddN": {
            "label": "User",
            "properties": [
              ["userId", {"Expr": {"Param": "userId"}}],
              ["name",   {"Expr": {"Param": "name"}}]
            ]
          }}
        ],
        "condition": {"VarEmpty": "existing"}
      }}
    ],
    "returns": ["updated", "created"]
  },
  "parameters":      {"userId": "u-42", "name": "Alice"},
  "parameter_types": {"userId": "String", "name": "String"}
}
```

Exactly one of `updated` / `created` is populated per call.

---

## 14. Write: `ForEach` over an array parameter (bulk insert)

**Goal:** insert one `User` node per object in the `data` array.

```json
{
  "request_type": "write",
  "query": {
    "queries": [
      {"ForEach": {
        "param": "data",
        "body": [
          {"Query": {
            "name": "created",
            "steps": [
              {"AddN": {
                "label": "User",
                "properties": [
                  ["externalId", {"Expr": {"Param": "externalId"}}],
                  ["embedding",  {"Expr": {"Param": "embedding"}}]
                ]
              }}
            ],
            "condition": null
          }}
        ]
      }}
    ],
    "returns": ["created"]
  },
  "parameters": {
    "data": [
      {"externalId": "u-1", "embedding": [0.1, 0.2]},
      {"externalId": "u-2", "embedding": [0.3, 0.4]}
    ]
  },
  "parameter_types": {"data": {"Array": "Object"}}
}
```

Inside `body`, the fields of each object (`externalId`, `embedding`) are available as scoped `Param` references. Match shape for `#[register] fn(data: Vec<ParamObject>)` — see `tests/register_metadata_tests.rs:36-56`.

---

## 15. Write: typed-array parameter + `DateTime` parameter

**Goal:** restrict to users whose status is in a list and were created after a datetime.

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "users",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"Where": {"And": [
            {"IsInExpr": ["status", {"Param": "statuses"}]},
            {"Compare": {
              "left": {"Property": "createdAt"}, "op": "Gte", "right": {"Param": "since"}
            }}
          ]}},
          {"Values": ["$id", "status", "createdAt"]}
        ],
        "condition": null
      }}
    ],
    "returns": ["users"]
  },
  "parameters": {
    "statuses": ["active", "pending"],
    "since": "2026-01-01T00:00:00Z"
  },
  "parameter_types": {
    "statuses": {"Array": "String"},
    "since": "DateTime"
  }
}
```

`DateTime` values may also be sent as epoch-millis integers; the type declaration is what triggers coercion.

---

## 16. Write: `CreateIndex` / `DropIndex` (equality + vector + text)

**Goal:** bootstrap a new label with an equality index on `userId`, a multitenant vector index on `embedding`, and a multitenant text index on `body`.

```json
{
  "request_type": "write",
  "query": {
    "queries": [
      {"Query": {
        "name": "idx_userId",
        "steps": [
          {"CreateIndex": {
            "spec": {"NodeEquality": {"label": "User", "property": "userId", "unique": true}},
            "if_not_exists": true
          }}
        ],
        "condition": null
      }},
      {"Query": {
        "name": "idx_embedding",
        "steps": [
          {"CreateIndex": {
            "spec": {"NodeVector": {"label": "Document", "property": "embedding", "tenant_property": "tenantId"}},
            "if_not_exists": true
          }}
        ],
        "condition": null
      }},
      {"Query": {
        "name": "idx_body",
        "steps": [
          {"CreateIndex": {
            "spec": {"NodeText": {"label": "Document", "property": "body", "tenant_property": "tenantId"}},
            "if_not_exists": true
          }}
        ],
        "condition": null
      }}
    ],
    "returns": ["idx_userId", "idx_embedding", "idx_body"]
  }
}
```

To drop instead, replace each `CreateIndex` with:

```json
{"DropIndex": {"spec": <IndexSpec>}}
```

---

## 17. Warm a read route

**Goal:** prefetch caches for a recurring read without retrieving rows.

```text
POST /v1/query
X-Helix-Warm: true
Content-Type: application/json
```

```json
{
  "request_type": "read",
  "query": {
    "queries": [
      {"Query": {
        "name": "user",
        "steps": [
          {"NWhere": {"Eq": ["$label", {"String": "User"}]}},
          {"Where": {"Compare": {
            "left": {"Property": "userId"}, "op": "Eq", "right": {"Param": "userId"}
          }}},
          {"Values": ["$id", "name"]}
        ],
        "condition": null
      }}
    ],
    "returns": ["user"]
  },
  "parameters":      {"userId": "u-42"},
  "parameter_types": {"userId": "String"}
}
```

On success the gateway returns `204 No Content`. Rejected with `4xx` if `request_type` is `"write"`.
