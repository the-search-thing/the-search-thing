# Contributing

Thanks for your interest in contributing to **the-search-thing**.
This guide covers local setup, daily development workflow, and the frontend website in `website/`.

## Prerequisites

- Rust (for sidecar + indexing/search core)
- Node.js + npm (for desktop client and website)
- Docker (optional, only for local Helix)
- `ffmpeg` and `ffprobe` available on your `PATH`
- Groq API key (for transcription + vision summaries)

## Setup

### 1) Configure environment

```bash
cp .env.example .env
```

Set these values in `.env`:

- `GROQ_API_KEY`
- `HELIX_LOCAL=false`
- `HELIX_ENDPOINT=https://your-flyio-host-name.fly.dev`
- `HELIX_PORT=your-flyio-port`
- `HELIX_API_KEY` (if your Fly Helix instance uses auth)

### 2) Helix runtime mode

**Fly.io (default):** no local Docker needed.

```bash
# uses remote Helix via HELIX_ENDPOINT/HELIX_PORT
```

**Local Docker (optional):**

```bash
# switch env
HELIX_LOCAL=true
HELIX_ENDPOINT=http://localhost
HELIX_PORT=7003

# start local Helix instance
helix push dev
```

> Note: `helix.toml` is already present, so you do **not** need to run `helix init`.

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

## Runtime configuration

The desktop app routes through the Rust sidecar JSON-RPC path by default.

- `HELIX_LOCAL` (default behavior: `true` if unset)
- `HELIX_ENDPOINT`
  - local default when `HELIX_LOCAL=true`: `http://localhost`
  - required when `HELIX_LOCAL=false` (e.g. `https://helix-the-search-thing-tst.fly.dev`)
- `HELIX_PORT`
  - local default when `HELIX_LOCAL=true`: `7003 for example`
  - remote default when `HELIX_LOCAL=false`: `443 for example`
- `HELIX_API_KEY` (optional, for secured Helix deployments)


## Usage notes

### Supported types

File types are defined in `config/file_types.json`.
Ignored extensions/files live in `config/ignore.json`.

### Indexing behavior

- Indexing is non-blocking and returns a job ID.
- Video indexing splits videos into chunks, extracts audio + thumbnails, and embeds transcripts + frame summaries.
- Image indexing generates a structured summary, then embeds that summary for search.

## Development notes

- If you change Rust code, rebuild with:
  ```bash
  maturin develop --release
  ```
- Build the sidecar with:
  ```bash
  npm --prefix client run sidecar:build:debug
  ```
- Electron uses IPC through the Rust sidecar for `index`, `index-status`, and `search` by default.
- JSON-RPC route tests live in `tests/sidecar_jrpc.rs`.
- Run JSON-RPC integration tests with:
  ```bash
  npm --prefix client run sidecar:test:jrpc
  ```
- Property-based sidecar tests for the video indexer live in:
  `src/sidecar/rpc/indexing/video/property_tests.rs`
- Run video indexer property tests with:
  ```bash
  cargo test --bin the-search-thing-sidecar sidecar::rpc::indexing::video::property_tests::
  ```
- Property tests in this repo follow a Zed-style randomized approach: seeded RNG, generated scenarios, and invariant assertions over orchestration behavior.

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

## Frontend website (Next.js)

The site lives in `website/` and is a standalone Next.js app.

```bash
cd website
npm install
npm run dev
```
Open `http://localhost:3000` and edit files under `website/src/`.
