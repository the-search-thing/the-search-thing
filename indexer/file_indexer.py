import asyncio
import json
import uuid
from pathlib import Path
from typing import List

from the_search_thing import walk_and_get_files_content  # ty:ignore[unresolved-import]

from utils.clients import get_helix_client


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
                    "error": "path not found",
                }
            )
            continue

        try:
            files_content = walk_and_get_files_content(path)
        except Exception as e:
            print(f"[WARN] Skipping (walk failed): {path} — {e}")
            results.append(
                {"path": path, "file_id": None, "indexed": False, "error": str(e)}
            )
            continue

        for file_path, content in files_content.items():
            file_id = str(uuid.uuid4())
            try:
                await create_file(file_id, content, path=file_path)
                await create_file_embeddings(file_id, content, path=file_path)
                results.append({"path": file_path, "file_id": file_id, "indexed": True})
                print(f"[OK] Indexed file: {file_path}")
            except Exception as e:
                print(f"[ERROR] Indexing failed for {file_path}: {e}")
                results.append(
                    {
                        "path": file_path,
                        "file_id": file_id,
                        "indexed": False,
                        "error": str(e),
                    }
                )

    return results


# create file mode
async def create_file(file_id: str, content: str, path: str) -> str:
    file_params = {"file_id": file_id, "content": content, "path": path}

    def _query() -> str:
        helix_client = get_helix_client()
        return json.dumps(helix_client.query("CreateFile", file_params))

    return await asyncio.to_thread(_query)


# create & connect file embeddings to file node
async def create_file_embeddings(file_id: str, content: str, path: str) -> str:
    file_params = {"file_id": file_id, "content": content, "path": path}

    def _query() -> str:
        helix_client = get_helix_client()
        return json.dumps(
            helix_client.query(
                "CreateFileEmbeddings",
                file_params,
            )
        )

    return await asyncio.to_thread(_query)
