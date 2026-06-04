# Native IPC, GPUI, and why this path differs from Electron

This document describes **what we built** for the GPUI frontend rewrite: the native framed-binary IPC lane alongside the existing JSON-RPC sidecar, how the GPUI app triggers search on Enter, and **why** that stack can feel dramatically faster than shipping Electron plus Chromium—even though much of the “real” search work still lives in Rust (`the-search-thing-sidecar`) in both cases.

---

## 1. Goals

1. **Keep one Rust backend** (indexing, Helix integration, embeddings logic) while experimenting with a **lighter desktop shell**.
2. **Avoid JSON serialization on the hot path** between UI and sidecar when both peers are Rust, without deleting JSON-RPC (Electron still uses it).
3. **Prove end-to-end UX**: GPUI text field → native framed request → sidecar → structured results back into the UI.

---

## 2. Definitions

### Sidecar

A **separate process** (`the-search-thing-sidecar`) that owns heavy work: filesystem walks, indexing jobs, Helix queries, etc. The desktop UI does **not** embed that logic directly; it speaks to the sidecar over **stdin/stdout** (or could use sockets later).

**Why a sidecar:** crash isolation, reuse across Electron and GPUI, same binary in production and tests.

### JSON-RPC

A **remote procedure call style**: each message has a method name (`search.query`), parameters, an `id`, and either a `result` or an `error`. It does **not** mandate JSON as the encoding—but **in practice** almost everyone uses JSON text for JSON-RPC.

Our Electron client uses **JSON-RPC 2.0 over NDJSON** (see below).

### NDJSON (newline-delimited JSON)

**One JSON object per line** on a byte stream. The sidecar reads a line, parses JSON, handles it, writes one JSON line back.

**Pros:** trivial to debug with `curl`/scripts; works everywhere.

**Cons:** text encoding is verbose; parsing and allocating strings dominates when payloads are large (many search hits, big file batches).

### Framed binary messages

Instead of “one text line = one message”, we send:

1. A **32-bit little-endian length prefix** (how many bytes follow).
2. A **payload** of exactly that length.

The payload here is **`bincode`** serialization of Rust enums/structs (`NativeRequest` / `NativeResponse`). Same serde models could use another codec (e.g. Postcard) later without changing the overall idea.

**Pros:** compact on the wire; faster encode/decode than JSON for structured blobs; natural fit for Rust↔Rust.

**Cons:** not human-readable; tooling must understand framing + schema versioning discipline.

### Native IPC mode (`THE_SEARCH_THING_IPC_MODE=native`)

An **environment flag** on the sidecar process:

- **Unset / not `native`:** legacy loop — read NDJSON lines, JSON-RPC dispatch (Electron-compatible).
- **`native`:** framed-bincode loop — read one framed `NativeRequest`, dispatch, write one framed `NativeResponse`, repeat until EOF on stdin.

Both modes share the **same underlying Rust handlers** for search and walks where we wired them (e.g. `search_query_value`, `walk_text_batch`).

### GPUI (gpui-ce)

A **native GPU-accelerated UI toolkit** (Rust). The demo app lives under `the-search-thing-gpui/`. It renders windows and widgets **without** embedding Chromium or V8.

### Electron + Chromium (existing stack)

**Electron** is Node.js + **Chromium**: multi-process browser engine, JavaScript on the main/renderer boundary, large runtime footprint. Your app already uses a Rust sidecar; Electron’s main process still pays JSON parse/stringify and process orchestration costs around IPC.

---

## 3. What we implemented (by component)

### 3.1 Main crate: `src/sidecar/native_ipc.rs`

- **Wire format:** `u32_le(len) || bincode(payload)`.
- **Messages:**
  - `NativeRequest`: `Ping`, `SearchQuery { query }`, `WalkTextBatch(WalkTextBatchParams)`, …
  - `NativeResponse`: structured ping metadata, `SearchQueryResult` (typed rows: path, label, thumbnail URL), `WalkTextBatchResult`, or `Error { code, message }`.
- **Loop:** `run_stdio_loop()` reads framed requests until stdin EOF; each response is one framed message.
- **Search path:** calls **`search_query_value`** — the same Tokio + Helix pipeline refactored out of JSON-RPC `handle_query`, then converts the JSON-shaped result into **`NativeSearchQueryBody`** via `serde_json::Deserialize` (shape matches existing JSON-RPC result).

### 3.2 Sidecar binary: `src/bin/the-search-thing-sidecar.rs`

At startup:

1. Load `.env.local` then `.env` (`dotenv`): local-first so secrets in `.env.local` apply when both files define the same key (crate only sets unset vars).
2. If `THE_SEARCH_THING_IPC_MODE=native` → run **`native_ipc::run_stdio_loop()`** and exit when stdin closes.
3. Else → existing **NDJSON JSON-RPC** loop.

Electron continues to spawn the sidecar **without** that env var, so behavior is unchanged.

### 3.3 Integration tests: `tests/sidecar_native_ipc.rs`

Spawns the real binary with `THE_SEARCH_THING_IPC_MODE=native`, sends framed `Ping` and `WalkTextBatch`, asserts decoded responses. This guards regressions on framing and dispatch.

### 3.4 GPUI app: `the-search-thing-gpui/`

**Dependency:** `the_search_thing = { path = ".." }` so the UI shares **`NativeRequest` / `NativeResponse`** and framing helpers—no duplicate protocol by hand.

**`native_sidecar.rs`:**

- Resolves `the-search-thing-sidecar` next to the repo (`../target/debug` or `../target/release`), or **`THE_SEARCH_THING_SIDECAR`** override.
- Sets **`THE_SEARCH_THING_IPC_MODE=native`**, sets **`current_dir`** to inferred repo root (matches typical Helix/config-relative paths).
- **One-shot RPC:** spawn process → write framed `SearchQuery` → read framed response → map into `Vec<NativeSearchRow>` (or surface `NativeResponse::Error`).

**`input_dialog.rs`:**

- New action **`SubmitSearch`** bound to **`enter`**.
- **`SearchSubmitted { query }`** event emitted via **`cx.emit`**; **`TextInput`** implements **`EventEmitter<SearchSubmitted>`**.

**`main.rs` (`LayoutExample`):**

- **`cx.subscribe(&dialog_input, …)`** listens for **`SearchSubmitted`** and runs **`on_search_submitted`**.
- **Critical detail:** the returned **`Subscription`** is stored on **`LayoutExample`** as **`_search_events`**. If `Subscription` is dropped immediately, GPUI **unsubscribes**—that was an early bug where Enter appeared to do nothing.
- Search runs inside **`cx.spawn` → `background_spawn`** so blocking subprocess IO does not freeze the UI thread.
- Results panel shows busy state, errors, or hit rows.

**`Cargo.toml`:** `default-run = "gpui-port-tst"` so plain **`cargo run`** launches the UI binary.

### 3.5 Micro-benchmark: `the-search-thing-gpui/src/bin/ipc_compare.rs`

Not wired to production—it isolates **serialize/deserialize cost** of JSON-shaped payloads vs framed bincode for synthetic hit lists. Useful to justify the protocol experiment; **not** a substitute for end-to-end profiling.

---

## 4. How messages flow (GPUI → Helix)

High level:

```text
[ GPUI ] -- framed NativeRequest::SearchQuery --> stdin
                                              [ sidecar native loop ]
                                                      |
                                                      v
                                              search_query_value()
                                                      |
                                                      v
                                              Helix / embeddings / FS
                                                      |
                                                      v
[ GPUI ] <-- framed NativeResponse::SearchQueryResult -- stdout
```

Docker logs you watch are typically **Helix** (or whatever backs search), not Chromium—the UI shell changed; the backend contract is still “talk to Helix through Rust.”

---

## 5. Why this can feel “really fast” vs Electron + Chromium

### 5.1 Fewer layers between intent and pixels

| Layer | Electron + Chromium | GPUI + native IPC |
|--------|------------------------|-------------------|
| UI runtime | Chromium renderer + JS/V8 | Rust UI + GPU path (gpui-ce) |
| IPC to backend | Main ↔ renderer (often) + JSON stringify/parse | Rust structs ↔ framed bincode |
| Browser composition | Full layout engine + style pipeline | App-owned layout only |

Even when the **same sidecar** does Helix work, removing Chromium eliminates a huge amount of **idle CPU, memory, and latency jitter** unrelated to your search algorithm.

### 5.2 Binary IPC vs JSON-RPC text for structured payloads

For responses with **many hits** or large strings, JSON spends CPU on:

- UTF-8 text formatting (`"` escapes, commas, braces),
- parsing back into structured data,

while **`bincode`** writes a dense packed representation with comparatively cheap serde traversal.

So improvements show up most clearly when **result volume** is high or when the UI refreshes often—not necessarily when Helix itself is the bottleneck on tiny responses.

### 5.3 Startup and footprint

Chromium-based shells pay **large cold start** and **resident memory** for engine processes and caches. A GPUI binary is still substantial (GPU stack, fonts), but it avoids spawning an entire browser multiprocess tree alongside your app logic.

### 5.4 Honest limits

- **Helix / Docker / network embeddings** can still dominate wall-clock time; a faster shell doesn’t make remote vector search instantaneous.
- The current GPUI path uses **one subprocess spawn per search** as an MVP—cheap compared to Chromium but not free; a persistent sidecar connection would shave fork overhead further.
- **Debugging:** NDJSON JSON-RPC is easier to `tail`; framed bincode needs small tooling or logging.

---

## 6. Operational reference

### Build sidecar (repo root)

```bash
cargo build -p the_search_thing --bin the-search-thing-sidecar
```

### Run GPUI UI (`the-search-thing-gpui`)

```bash
cargo run
```

Type a query, press **Enter**. Stderr from the sidecar appears in the terminal that launched GPUI.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `THE_SEARCH_THING_IPC_MODE=native` | Sidecar speaks framed bincode (set automatically by GPUI harness). |
| `THE_SEARCH_THING_SIDECAR` | Absolute path to sidecar if not under `../target/{debug,release}/`. |
| `HELIX_ENDPOINT`, `HELIX_PORT`, `HELIX_API_KEY`, … | Same as Electron sidecar; must reach Helix (e.g. Docker-published ports). |

---

## 7. Summary

We implemented a **second IPC dialect** on the existing Rust sidecar—**framed bincode** behind **`THE_SEARCH_THING_IPC_MODE=native`**—while preserving **JSON-RPC NDJSON** for Electron. The GPUI prototype wires **Enter** to fire **`SearchQuery`** through that native path, with **`Subscription` lifetime** handled correctly so events actually arrive.

That combination—**native UI without Chromium** plus **binary IPC between Rust processes**—is why the experience can feel sharply faster than “Electron talking JSON to the same binary”: most of the win is **removing the browser**, with an extra bump whenever **payload serialization** used to matter.
