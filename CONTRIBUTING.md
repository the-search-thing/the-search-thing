# Contributing

Thanks for your interest in contributing to **the-search-thing**.
This guide covers architecture, local setup, daily development workflow.

## Architecture (high level)

- Electron UI (`client/`): desktop search experience
- Rust sidecar (`src/bin/the-search-thing-sidecar.rs` + `src/sidecar/`): JSON-RPC (NDJSON over stdio), route handlers, adapters
- Helix DB (`db/schema.hx`, `db/queries.hx`): graph + vector storage

## Technology stack

- Rust (sidecar + adapters + indexing/search internals)
- Helix DB for vector + graph storage
- Groq for transcription and vision summaries
- Electron + React for the desktop app

## Prerequisites

- Rust (for sidecar + indexing/search core)
- Node.js + npm (for desktop client)
- Docker (for running Helix locally)
- `ffmpeg` and `ffprobe` available on your `PATH`
- Groq API key (for transcription + vision summaries)
- Voyage AI API key (for embedding generation)

## Setup

### 1) Configure environment

```bash
cp .env.example .env
```

Set these values in `.env`:
```bash
- `GEMINI_API_KEY`=
- `OPENAI_API_KEY`=
- `GROQ_API_KEY`=
- `VOYAGE_API_KEY`=
- `VOYAGE_EMBED_MODEL`=
- `VOYAGE_RETRIEVAL_MODEL`=

# helix
HELIX_PORT=6969
HELIX_LOCAL=True
```


### 2) Start Helix locally

Make sure Docker is running, then:

```bash
helix push dev
```

### 3) Install ffmpeg/ffprobe

macOS (Homebrew):

```bash
brew install ffmpeg
```

Ubuntu/Debian:

```bash
sudo apt update && sudo apt install -y ffmpeg
```

Windows (winget):

```powershell
winget install --id Gyan.FFmpeg -e
```

Verify both tools are available:

```bash
ffmpeg -version
ffprobe -version
```

### 4) Install client dependencies

```bash
npm --prefix client install
```

### 5) Run the desktop app locally

```bash
npm --prefix client run dev
```

## Usage notes

### Supported types

- File types are defined in `config/file_types.json`.
- Ignored extensions/files live in `config/ignore.json`.

### Indexing behavior

- Indexing is non-blocking and returns a job ID.
- Video indexing splits videos into chunks, extracts audio + thumbnails, and embeds transcripts + frame summaries.
- Image indexing generates a structured summary, then embeds that summary for search.

## Development notes

- If you change Rust code, rebuild with:
  ```bash
  npm --prefix client run sidecar:build:debug
  ```

### Local app databases

- Search history DB: `app.getPath('userData')/search-history.db`
  - Schema: `client/lib/storage/search-history-store.ts`
  - Windows: `C:\Users\<you>\AppData\Roaming\the-search-thing\search-history.db`
  - macOS: `~/Library/Application Support/the-search-thing/search-history.db`
  - Linux: `~/.config/the-search-thing/search-history.db`

- Keybinds DB: `app.getPath('userData')/keybinds.db`
  - Schema: `client/lib/storage/keybinds-db-store.ts`
  - Windows: `C:\Users\<you>\AppData\Roaming\the-search-thing\keybinds.db`
  - macOS: `~/Library/Application Support/the-search-thing/keybinds.db`
  - Linux: `~/.config/the-search-thing/keybinds.db`

## Frontend website (static)

The marketing site lives in `website/` — plain HTML, CSS, and JavaScript (no build step).

```bash
cd website
python3 -m http.server 3000
# optional: npm run dev  (uses npx serve)
```

Open `http://localhost:3000` and edit `index.html`, `styles.css`, or `main.js`.
