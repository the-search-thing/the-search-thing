import hashlib
from pathlib import Path
from typing import Union


def compute_file_hash(path: Union[str, Path], chunk_size: int = 1024 * 1024) -> str:
    hasher = hashlib.sha256()
    file_path = Path(path)
    with file_path.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def compute_bytes_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
