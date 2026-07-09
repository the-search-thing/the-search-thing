#!/usr/bin/env sh

set -eu

repo_dir=".repos/effect"
repo_url="https://github.com/Effect-TS/effect-smol"

if [ -d "$repo_dir/.git" ]; then
  origin="$(git -C "$repo_dir" remote get-url origin 2>/dev/null || true)"
  case "$origin" in
    *effect-smol*)
      exit 0
      ;;
  esac

  echo "Replacing $repo_dir (expected Effect v4 source: effect-smol)"
  rm -rf "$repo_dir"
fi

mkdir -p ".repos"
git clone --depth 1 "$repo_url" "$repo_dir"
