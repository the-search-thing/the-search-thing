# Contributing

Thanks for your interest in contributing to the-search-thing. This guide covers the dev setup, local workflow, and the frontend website in `website/`.

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
# set GROQ_API_KEY, HELIX_LOCAL=true, HELIX_PORT=7002 (or whatever port you like).
```

4) Setup Helix Docker image to run locally

Make sure you have docker running before proceeding

```bash
helix push dev
```

> Note: Because we already have [helix.toml](./helix.toml) defined, we don't need to run `helix init`


5) Start the API

```bash
uv run -m backend.app
# or: uvicorn backend.app:app --reload
```

6) Start the Electron app

```bash
cd client
npm install
npm run dev
```

## Usage

### Index a directory (API)

macOS / Linux:

```bash
curl "http://localhost:8000/api/index?dir=/path/to/folder"
```

Windows (PowerShell):

```powershell
curl.exe --get "http://localhost:8000/api/index" --data-urlencode "dir=C:\path with spaces"
```

### Search (API)

```bash
curl "http://localhost:8000/api/search?q=meeting notes"
```

## Supported types

File types are defined in `config/file_types.json`.
Ignored extensions/files live in `config/ignore.json`.

## Notes

- Indexing is non-blocking and returns a job id.
- Video indexing splits videos into chunks, extracts audio + thumbnails, and embeds transcripts + frame summaries.
- Image indexing generates a structured summary, then embeds that summary for search.

## Development notes

- If you change Rust code, rebuild with `maturin develop --release`.
- Electron UI uses IPC to FastAPI calls (see `client/lib/conveyor/handlers/search-handler.ts`).
- Local search history is stored in a SQLite DB at `app.getPath('userData')/search-history.db` (schema in `client/lib/storage/search-history-store.ts`).
  - Windows: `C:\Users\<you>\AppData\Roaming\<YourApp>\search-history.db`
  - macOS: `~/Library/Application Support/<YourApp>/search-history.db`
  - Linux: `~/.config/<YourApp>/search-history.db`
- Keybinds are stored in a separate SQLite DB at `app.getPath('userData')/keybinds.db` (schema in `client/lib/storage/keybinds-db-store.ts`).
  - Windows: `C:\Users\<you>\AppData\Roaming\<YourApp>\keybinds.db`
  - macOS: `~/Library/Application Support/<YourApp>/keybinds.db`
  - Linux: `~/.config/<YourApp>/keybinds.db`

## Windows packaging (Electron + backend)

The Windows app bundles a FastAPI backend compiled into a single exe via PyInstaller, plus ffmpeg binaries.

### Build steps

From `client/`:

```bash
npm run backend:build:win
npm run build:win
```

`backend:build:win` runs `maturin develop --release`, builds the backend exe via PyInstaller, and copies it into `client/resources/backend/backend.exe`. `build:win` packages the Electron app and includes the backend + ffmpeg in `resources/`.

### ffmpeg binaries

Place Windows binaries here before packaging:

- `client/resources/ffmpeg/ffmpeg.exe`
- `client/resources/ffmpeg/ffprobe.exe`

The Electron main process adds this folder to `PATH` and passes `FFMPEG_PATH` / `FFPROBE_PATH` to the backend.

### Port selection

We default to port `49000` because some Windows installs cannot bind to `47xxx` ports (WinError 10048). The Electron main process probes `49000–49099` and picks the first free port.

- Port logic lives in `client/lib/main/backend.ts`.
- The chosen backend URL is written to `backend-url.txt` at `app.getPath('userData')`.
- Backend stdout/stderr is logged to `backend.log` in the same directory.

### Environment passthrough

Packaged apps do not load `.env` by default. The Electron main process explicitly sets backend env values when spawning the exe. See `client/lib/main/backend.ts`:

- `HOST`, `PORT`, `BACKEND_URL`
- `HELIX_PORT`, `HELIX_LOCAL`
- `FFMPEG_PATH`, `FFPROBE_PATH`

## Frontend website (Next.js)

The marketing site lives in `website/`. It is a standalone Next.js app.

```bash
cd website
npm install
npm run dev
```

Open `http://localhost:3000` and edit files under `website/src/`.
