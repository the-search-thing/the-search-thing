import json
import uuid
from pathlib import Path
from typing import List

from the_search_thing import get_file_contents  # ty:ignore[unresolved-import]

from utils.clients import get_helix_client


async def get_contents(file_path: str):
    content = get_file_contents(file_path)
    return content


async def file_indexer(
    file_paths: List[str] | str,
) -> List[dict]:
    if isinstance(file_paths, str):
        file_paths = [file_paths]
    if not file_paths:
        print("no file paths provided. exiting file indexing")
        return []

    results: List[dict] = []
    for path in file_paths:
        p = Path(path)
        if not p.exists():
            print(f"[WARN] Skipping (not found): {path}")
            results.append(
                {
                    "path": path,
                    "file_id": None,
                    "indexed": False,
                    "error": "file not found",
                }
            )
            continue
        if not p.is_file():
            print(f"[WARN] Skipping (not a file): {path}")
            results.append(
                {"path": path, "file_id": None, "indexed": False, "error": "not a file"}
            )
            continue
        try:
            content = p.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            print(f"[WARN] Skipping (read failed): {path} — {e}")
            results.append(
                {"path": path, "file_id": None, "indexed": False, "error": str(e)}
            )
            continue
        file_id = str(uuid.uuid4())
        try:
            await create_file(file_id, content)
            await create_file_embeddings(file_id, content)
            results.append({"path": path, "file_id": file_id, "indexed": True})
            print(f"[OK] Indexed file: {path}")
        except Exception as e:
            print(f"[ERROR] Indexing failed for {path}: {e}")
            results.append(
                {"path": path, "file_id": file_id, "indexed": False, "error": str(e)}
            )
    return results


# create file mode
async def create_file(file_id: str, content: str) -> str:
    helix_client = get_helix_client()
    file_params = {"file_id": file_id, "content": content}
    return json.dumps(helix_client.query("CreateFile", file_params))


# create & connect file embeddings to file node
async def create_file_embeddings(file_id: str, content: str) -> str:
    helix_client = get_helix_client()
    return json.dumps(
        helix_client.query(
            "CreateFileEmbeddings",
            {"file_id": file_id, "content": content},
        )
    )
