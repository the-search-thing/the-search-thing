import re
from pathlib import Path

THUMBNAIL_HASHES: set[str] = set()

REPO_ROOT = Path(__file__).resolve().parents[2]
THUMBNAILS_DIR = REPO_ROOT / "videos" / "thumbnails"

_HASH_RE = re.compile(r"^[a-fA-F0-9]{64}$")


def load_thumbnail_cache() -> None:
    THUMBNAIL_HASHES.clear()
    if not THUMBNAILS_DIR.exists():
        return
    for entry in THUMBNAILS_DIR.iterdir():
        if not entry.is_file():
            continue
        if entry.suffix.lower() != ".jpg":
            continue
        stem = entry.stem
        if _HASH_RE.fullmatch(stem):
            THUMBNAIL_HASHES.add(stem)


def has_thumbnail(content_hash: str) -> bool:
    return content_hash in THUMBNAIL_HASHES


def add_thumbnail(content_hash: str) -> None:
    if _HASH_RE.fullmatch(content_hash):
        THUMBNAIL_HASHES.add(content_hash)


load_thumbnail_cache()
