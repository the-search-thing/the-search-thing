#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[ffmpeg] %s\n' "$1"
}

fail() {
  printf '[ffmpeg] %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

if [[ "$(uname -s)" != "Linux" ]]; then
  log "Skipping Linux FFmpeg fetch on non-Linux host."
  exit 0
fi

arch="$(uname -m)"
if [[ "$arch" != "x86_64" && "$arch" != "amd64" ]]; then
  fail "Unsupported Linux architecture: $arch (expected x86_64/amd64)"
fi

need_cmd curl
need_cmd tar

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
client_root="$(cd "$script_dir/.." && pwd)"
resources_root="$client_root/resources"
cache_home="${XDG_CACHE_HOME:-$HOME/.cache}"
cache_root="${FFMPEG_CACHE_DIR:-$cache_home/the-search-thing/ffmpeg}"

ffmpeg_version="${FFMPEG_VERSION:-release}"
archive_name="ffmpeg-${ffmpeg_version}-amd64-static"
archive_url="https://johnvansickle.com/ffmpeg/releases/${archive_name}.tar.xz"
cache_dir="$cache_root/linux-x64"
dest_dir="$resources_root/ffmpeg/linux-x64"
archive_path="$cache_dir/${archive_name}.tar.xz"
extract_dir="$cache_dir/extract"

mkdir -p "$cache_dir"
if [[ ! -f "$archive_path" ]]; then
  log "Downloading ${archive_name}..."
  if ! curl -fL --retry 3 --retry-delay 2 -o "$archive_path" "$archive_url"; then
    if [[ "$ffmpeg_version" != "release" ]]; then
      archive_name="ffmpeg-release-amd64-static"
      archive_url="https://johnvansickle.com/ffmpeg/releases/${archive_name}.tar.xz"
      archive_path="$cache_dir/${archive_name}.tar.xz"
      log "Versioned archive not found, falling back to ${archive_name}..."
      curl -fL --retry 3 --retry-delay 2 -o "$archive_path" "$archive_url"
    else
      fail "Failed to download Linux ffmpeg archive from ${archive_url}"
    fi
  fi
  log "Downloaded ${archive_name}"
else
  log "Using cached ffmpeg archive: $archive_path"
fi

rm -rf "$extract_dir"
mkdir -p "$extract_dir"
log "Extracting ${archive_name}..."
tar -xJf "$archive_path" -C "$extract_dir"

root_dir="$extract_dir/$archive_name"
if [[ ! -d "$root_dir" ]]; then
  for candidate in "$extract_dir"/*; do
    if [[ -d "$candidate" ]]; then
      root_dir="$candidate"
      break
    fi
  done
fi

[[ -d "$root_dir" ]] || fail "Could not locate extracted ffmpeg directory."
log "Extracted ffmpeg to $root_dir"

bin_dir="$root_dir/bin"
if [[ ! -d "$bin_dir" || ! -f "$bin_dir/ffmpeg" ]]; then
  if [[ -f "$root_dir/ffmpeg" ]]; then
    bin_dir="$root_dir"
  else
    fail "Could not locate ffmpeg bin directory."
  fi
fi

rm -rf "$dest_dir"
mkdir -p "$dest_dir"
cp "$bin_dir/ffmpeg" "$dest_dir/ffmpeg"
cp "$bin_dir/ffprobe" "$dest_dir/ffprobe"
chmod +x "$dest_dir/ffmpeg" "$dest_dir/ffprobe"

[[ -f "$dest_dir/ffmpeg" ]] || fail "ffmpeg missing after staging."
[[ -f "$dest_dir/ffprobe" ]] || fail "ffprobe missing after staging."

log "Staged ffmpeg binaries to $dest_dir"
