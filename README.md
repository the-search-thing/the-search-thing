<h1 align="center">the-search-thing</h1>

<div align="center">
  <img src="branding/logo-white-bg.webp" alt="the-search-thing" width="400" />
  <p>Semantically search for your files, instantly.</p>
</div>

## What it is

the-search-thing is a local-first search system that makes your files, images, and videos semantically searchable from one place.

## Features

- Semantic search across files, images, and videos
- Sub-millisecond response targets for interactive search
- Directory indexing with ignore rules
- Desktop UI with file open actions
- Natural language queries with ranked results
- Rust sidecar JSON-RPC transport between Electron and core indexing/search logic

## Architecture (high level)

- Electron UI (`client/`): desktop search experience
- Rust sidecar (`src/bin/the-search-thing-sidecar.rs` + `src/sidecar/`): JSON-RPC (NDJSON over stdio), route handlers, adapters
- Helix DB (`db/schema.hx`, `db/queries.hx`): graph + vector storage
- FastAPI (`backend/app.py`): still used during migration for remaining Python-backed paths
- Python (`backend/`): transitional runtime for non-migrated internals (image/video pipeline migration in progress)

## Contributing

See `CONTRIBUTING.md` for setup, dev workflow, and frontend website instructions.

## Technologies used

- Rust (sidecar + adapters + indexing/search internals)
- Python (transitional fallback during migration)
- FastAPI (transitional HTTP layer for compatibility paths)
- Helix DB for vector + graph storage
- Groq for transcription and vision summaries
- Electron + React for the desktop app

## License

GPL-3.0-only. See `LICENSE` for details.
