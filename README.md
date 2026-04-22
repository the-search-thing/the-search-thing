<h1 align="center">the-search-thing</h1>

<div align="center">
  <img src="branding/logo-white-bg.webp" alt="the-search-thing" width="400" />
  <p>Semantically search for your files, instantly.</p>
</div>

## What it is

the-search-thing is a local-first search system that makes your files, images, and videos
semantically searchable from one place.

## Features

- Semantic search across files, images, and videos
- Sub-millisecond response targets for interactive search
- Directory indexing with ignore rules
- Desktop UI with file open actions
- Natural language queries with ranked results
- Rust sidecar JSON-RPC transport between Electron and core indexing/search logic

## Architecture (high level)

- Electron UI (`client/`): desktop search experience
- Rust sidecar (`src/bin/the-search-thing-sidecar.rs` + `src/bin/sidecar/`): JSON-RPC (NDJSON over stdio), route handlers, adapters
- Helix DB (`db/schema.hx`, `db/queries.hx`): graph + vector storage
- FastAPI (`backend/app.py`): still used during migration for remaining Python-backed paths
- Python (`backend/`): transitional runtime for non-migrated internals (image/video pipeline migration in progress)

## Rewrite status

This project is actively migrating from Python-orchestrated routes to a Rust sidecar core.

- `health.ping`, `fs.walkTextBatch`, `index.start`, `index.status`, and `search.query` are exposed through Rust JSON-RPC routes
- Text indexing and search now support Rust-native execution modes (`rust-text`, `rust-helix`)
- Python remains as a fallback/compat layer while image and video indexing internals are being migrated
- Goal: keep Electron API contracts stable while replacing internals behind sidecar route boundaries

## UI flow

<div align="center">
  <img src="docs/demo.gif" alt="Search demo" width="800" />
  <p>Demo video or GIF (coming soon)</p>
</div>

- Choose a folder to index
- Enter a natural language query
- Open results directly from the app

## Contributing

See `CONTRIBUTING.md` for setup, dev workflow, and frontend website instructions.

## Try it without dev setup

Download the Windows `.exe` release from GitHub Releases (coming soon).

## Release

We will ship a Windows `.exe` release so users can try it without a dev setup.

## Technologies used

- Rust (sidecar + adapters + indexing/search internals)
- Python (transitional fallback during migration)
- FastAPI (transitional HTTP layer for compatibility paths)
- Helix DB for vector + graph storage
- Groq for transcription and vision summaries
- Electron + React for the desktop app

## License

GPL-3.0-only. See `LICENSE` for details.
