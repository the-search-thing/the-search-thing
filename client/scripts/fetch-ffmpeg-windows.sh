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

is_windows() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

if ! is_windows; then
  fail "This script is Windows-only."
fi

need_cmd curl

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
client_root="$(cd "$script_dir/.." && pwd)"
resources_root="$client_root/resources"
cache_dir="$resources_root/ffmpeg-cache/win-x64"
dest_dir="$resources_root/ffmpeg/win-x64"

ffmpeg_version="${FFMPEG_VERSION:-7.1}"
zip_name="ffmpeg-${ffmpeg_version}-full_build-shared"
zip_url="https://github.com/GyanD/codexffmpeg/releases/download/${ffmpeg_version}/${zip_name}.zip"
zip_path="$cache_dir/ffmpeg-${ffmpeg_version}.zip"
extract_dir="$cache_dir/extract"

mkdir -p "$cache_dir"

if [[ ! -f "$zip_path" ]]; then
  log "Downloading ${zip_name}..."
  if ! curl -fL --retry 3 --retry-delay 2 -o "$zip_path" "$zip_url"; then
    rm -f "$zip_path"
    fail "Download failed. Run ffmpeg:fetch again to retry."
  fi
  log "Downloaded ${zip_name}"
else
  log "Using cached ffmpeg archive: $zip_path"
fi

if [[ -d "$extract_dir" ]]; then
  rm -rf "$extract_dir"
fi

log "Extracting ${zip_name}..."
if command -v unzip >/dev/null 2>&1; then
  unzip -q "$zip_path" -d "$extract_dir"
elif command -v powershell.exe >/dev/null 2>&1; then
  if command -v cygpath >/dev/null 2>&1; then
    zip_path_win="$(cygpath -w "$zip_path")"
    extract_dir_win="$(cygpath -w "$extract_dir")"
  else
    fail "cygpath is required to use PowerShell extraction."
  fi
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \
    -Command "Expand-Archive -Path \"$zip_path_win\" -DestinationPath \"$extract_dir_win\" -Force"
else
  fail "Required command not found: unzip (or powershell.exe for extraction)"
fi

root_dir="$extract_dir/$zip_name"
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

bin_dir=""
if [[ -d "$root_dir/bin" && -f "$root_dir/bin/ffmpeg.exe" ]]; then
  bin_dir="$root_dir/bin"
else
  shopt -s nullglob
  for candidate in "$root_dir"/*/bin "$root_dir"/*/*/bin "$root_dir"/*/*/*/bin; do
    if [[ -f "$candidate/ffmpeg.exe" ]]; then
      bin_dir="$candidate"
      break
    fi
  done
  shopt -u nullglob
fi

[[ -n "$bin_dir" && -d "$bin_dir" ]] || fail "Could not locate ffmpeg bin directory."

if [[ -d "$dest_dir" ]]; then
  rm -rf "$dest_dir"
fi

mkdir -p "$dest_dir"
cp -a "$bin_dir"/. "$dest_dir"/

[[ -f "$dest_dir/ffmpeg.exe" ]] || fail "ffmpeg.exe missing after staging."
[[ -f "$dest_dir/ffprobe.exe" ]] || fail "ffprobe.exe missing after staging."

log "Staged ffmpeg binaries to $dest_dir"
