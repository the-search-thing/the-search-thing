# the-search-thing

Fast, semantic search across your local files, videos, and images.

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

## Architecture (high level)

- Rust + PyO3 (`src/`): filesystem walking, video chunking, audio extraction, thumbnail capture
- Python indexers (`indexer/`): file embeddings, video transcript + frame summary embeddings, image summary embeddings
- Helix DB (`db/schema.hx`, `db/queries.hx`): graph + vector storage
- FastAPI (`api.py`): indexing/search API
- Electron UI (`client/`): desktop search experience
- Directory indexing with ignore rules
- Desktop UI with file open actions

## UI flow

<div align="center">
  <img src="docs/demo.gif" alt="Search demo" width="800" />
  <p>Demo video or GIF (coming soon)</p>
</div>

- Choose a folder to index
- Enter a natural language query
- Open results directly from the app

## Prerequisites

- Python 3.11+
- Rust (for PyO3 / maturin build)
- ffmpeg + ffprobe on PATH
- Helix DB running locally
- Groq API key (for transcription + vision summaries)

## Setup

1) Install Python deps (uv)

```bash
uv venv
```

macOS / Linux:

```bash
source .venv/bin/activate
uv sync
```

Windows (PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
uv sync
```

2) Build Rust extension (PyO3)

```bash
maturin develop --release
```

3) Configure environment

```bash
cp .env.example .env
# set GROQ_API_KEY, HELIX_LOCAL=true, HELIX_PORT=7002, etc.
```

4) Start the API

```bash
python api.py
# or: uvicorn api:app --reload
```

5) Start the Electron app

```bash
cd client
npm install
npm run dev
```

## Usage

### Index a directory (API)

```bash
curl "http://localhost:8000/api/index?dir=/path/to/folder"
```

### Search (API)

```bash
curl "http://localhost:8000/api/search?q=meeting notes"
```

## Supported types

File types are defined in `json/file_types.json`.
Ignored extensions/files live in `json/ignore.json`.

## Notes

- Indexing is non-blocking and returns a job id.
- Video indexing splits videos into chunks, extracts audio + thumbnails, and embeds transcripts + frame summaries.
- Image indexing generates a structured summary, then embeds that summary for search.

## Development notes

- If you change Rust code, rebuild with `maturin develop --release`.
- Electron UI uses IPC to FastAPI calls (see `client/lib/conveyor/handlers/search-handler.ts`).

## Try it without dev setup

Download the Windows `.exe` release from GitHub Releases (coming soon).

## Release

We will ship a Windows `.exe` release so users can try it without a dev setup.

## Technologies used

- Rust + PyO3 for fast local indexing primitives
- Python for orchestration and API services
- FastAPI for the HTTP layer
- Helix DB for vector + graph storage
- Groq for transcription and vision summaries
- Electron + React for the desktop app

## License

TBD
