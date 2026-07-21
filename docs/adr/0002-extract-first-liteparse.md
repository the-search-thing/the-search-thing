# ADR 0002: Extract-first office search via LiteParse + fff

## Status

Accepted

## Context

Lexical search via `@ff-labs/fff-node` covers greppable text files. fff skips binaries (NUL / known binary extensions), so PDF and Office docs are invisible to `/search/grep`. Semantic/embeddings are a different product need and not required to close this gap.

## Decision

- Extract opaque documents to plain UTF-8 text with `@llamaindex/liteparse` (Node), not the browser WASM package.
- Materialize extracts under `EXTRACT_CACHE_DIR` and point a second fff `FileFinder` at that directory.
- Merge extract-cache grep into `contentSearch`, remapping `.txt` hits back to original paths.
- Partition by format so root and extract indexes do not cover the same file:
  - Greppable plain text (including `.csv` / `.tsv`) stays on the root finder only — native grep already sees the full content.
  - PDF / Office / RTF go through extract: root fff skips binaries or only sees markup/container bytes; extraction recovers searchable prose.
- Gate Office formats (`docx`/`xlsx`/`pptx`/…) on host LibreOffice (`soffice`) via Effect `ChildProcess` probe; PDF works without it.
- Defer Helix/Voyage semantic search until lexical coverage of office text is proven.

## Consequences

- Host dependency: LibreOffice for Office formats; ImageMagick later for images.
- Disk cache of extracted text under `.data/extracted` (or `EXTRACT_CACHE_DIR`).
- Index trigger: `POST /index/run` (extraction only). fff’s built-in watcher keeps both FileFinder indexes fresh; it does not run LiteParse.
- `contentSearch` can sum `totalMatched` across finders without double-counting the same source path; next index run prunes stale `.csv`/`.tsv` extracts.
