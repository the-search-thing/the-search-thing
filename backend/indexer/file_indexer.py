import asyncio
import json
import uuid
from pathlib import Path
from typing import List

from the_search_thing import walk_and_get_files_content  # ty:ignore[unresolved-import]

from backend.utils.clients import get_helix_client
from backend.utils.content_hash import compute_file_hash


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
            try:
                content_hash = compute_file_hash(file_path)
            except Exception as e:
                print(f"[WARN] Skipping (hash failed): {file_path} — {e}")
                results.append(
                    {
                        "path": file_path,
                        "file_id": None,
                        "indexed": False,
                        "error": str(e),
                    }
                )
                continue

            try:
                existing = await get_file_by_hash(content_hash)
            except Exception as e:
                print(f"[WARN] Hash lookup failed: {file_path} — {e}")
                existing = None

            if existing:
                results.append(
                    {
                        "path": file_path,
                        "file_id": existing.get("file_id"),
                        "indexed": False,
                        "error": "Duplicate content hash",
                    }
                )
                print(f"[SKIP] Already indexed file: {file_path}")
                continue

            file_id = str(uuid.uuid4())
            try:
                await create_file(file_id, content_hash, content, path=file_path)
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
async def create_file(file_id: str, content_hash: str, content: str, path: str) -> str:
    file_params = {
        "file_id": file_id,
        "content_hash": content_hash,
        "content": content,
        "path": path,
    }

    def _query() -> str:
        helix_client = get_helix_client()
        return json.dumps(helix_client.query("CreateFile", file_params))

    return await asyncio.to_thread(_query)


async def get_file_by_hash(content_hash: str) -> dict | None:
    def _query() -> list:
        helix_client = get_helix_client()
        return helix_client.query("GetFileByHash", {"content_hash": content_hash})

    response = await asyncio.to_thread(_query)
    if isinstance(response, str):
        try:
            response = json.loads(response)
        except json.JSONDecodeError:
            return None

    if isinstance(response, dict):
        file = response.get("file")
        if isinstance(file, list):
            return file[0] if file else None
        if isinstance(file, dict):
            return file
        return None

    if isinstance(response, list):
        return response[0] if response else None
    return None


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
