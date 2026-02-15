import asyncio
import json
import logging
import os
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
PORT = os.getenv("PORT")

app = FastAPI(title="the search thing")

app.add_middleware(
    CORSMiddleware,  # type: ignore[ arg-type ]
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/check")
async def index_exists():
    # Matches: { success: z.boolean() }
    return {"success": True}


class SearchRequest(BaseModel):
    query: str
    limit: int = 10


def _load_extension_to_category() -> dict[str, str]:
    """Load file_types.json; returns mapping ext -> category e.g. {'.mp4': 'video'}.
    Expects extensions to be lowercase with a leading '.'."""
    path = os.path.join(os.path.dirname(__file__), "file_types.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning("Could not load file_types.json: %s", e)
        return {}
    ext_to_category: dict[str, str] = {}
    for category, ext_list in data.items():
        if not isinstance(ext_list, list):
            continue
        for ext in ext_list:
            ext_to_category[ext] = category
    return ext_to_category


def _get_text_extensions(ext_to_category: dict[str, str]) -> list[str]:
    return [ext for ext, category in ext_to_category.items() if category == "text"]


def _get_video_extensions(ext_to_category: dict[str, str]) -> list[str]:
    return [ext for ext, category in ext_to_category.items() if category == "video"]


def _collect_files_by_extension(root: str, extensions: list[str]) -> list[str]:
    ext_set = {ext.lower() for ext in extensions}
    if os.path.isfile(root):
        ext = os.path.splitext(root)[1].lower()
        return [root] if ext in ext_set else []

    matches: list[str] = []
    for current_root, _, files in os.walk(root):
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext in ext_set:
                matches.append(os.path.join(current_root, name))
    return matches


def _log_task_exception(task: "asyncio.Task[None]", job_id: str) -> None:
    try:
        task.result()
    except Exception:
        logger.exception("[job:%s] Indexing job failed", job_id)


async def index_single_file(path: str, content: str, job_id: str) -> bool:
    from indexer.file_indexer import create_file, create_file_embeddings

    file_id = str(uuid.uuid4())
    try:
        await create_file(file_id, content, path=path)
        await create_file_embeddings(file_id, content, path=path)
        logger.info("[job:%s] [OK] Indexed: %s", job_id, path)
        return True
    except Exception as e:
        logger.error("[job:%s] [ERROR] Failed: %s - %s", job_id, path, e)
        return False


async def _process_batch(batch: list[tuple[str, str]], job_id: str) -> dict[str, int]:
    tasks = [
        asyncio.create_task(index_single_file(path, content, job_id))
        for path, content in batch
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    indexed = 0
    errors = 0
    for result in results:
        if isinstance(result, Exception):
            errors += 1
            logger.error("[job:%s] [ERROR] Batch task exception: %s", job_id, result)
        elif result:
            indexed += 1
        else:
            errors += 1

    return {"indexed": indexed, "errors": errors}


async def _run_indexing_job(dir: str, job_id: str, batch_size: int = 10) -> None:
    from the_search_thing import (
        walk_and_get_text_file_batch,  # ty: ignore[unresolved-import]
    )

    ext_to_category = _load_extension_to_category()
    text_exts = _get_text_extensions(ext_to_category)
    video_exts = _get_video_extensions(ext_to_category)
    cursor = 0
    total_found = 0
    text_indexed = 0
    non_text_skipped = 0
    errors = 0
    video_found = 0
    video_indexed = 0
    video_errors = 0

    logger.info("[job:%s] Started indexing job for: %s", job_id, dir)

    while True:
        try:
            batch, cursor, done, scanned_count, skipped_count = await asyncio.to_thread(
                walk_and_get_text_file_batch, dir, text_exts, cursor, batch_size
            )
        except Exception as e:
            logger.exception("[job:%s] Walk failed: %s", job_id, e)
            errors += 1
            break

        total_found += scanned_count
        non_text_skipped += skipped_count

        if batch:
            batch_results = await _process_batch(batch, job_id)
            text_indexed += batch_results["indexed"]
            errors += batch_results["errors"]

        if done:
            break

    if video_exts:
        video_files = await asyncio.to_thread(
            _collect_files_by_extension, dir, video_exts
        )
        video_found = len(video_files)
        if video_files:
            from indexer.indexer import indexer_function

            for video_path in video_files:
                video_id = uuid.uuid4().hex
                try:
                    results = await indexer_function(video_id, video_path)
                    if results:
                        video_indexed += sum(
                            1 for result in results if result.get("indexed")
                        )
                        video_errors += sum(
                            1 for result in results if not result.get("indexed")
                        )
                    else:
                        video_errors += 1
                except Exception as e:
                    video_errors += 1
                    logger.error(
                        "[job:%s] [ERROR] Video indexing failed: %s - %s",
                        job_id,
                        video_path,
                        e,
                    )

    logger.info(
        "[job:%s] [SUMMARY] Job completed for %s - Found: %d, Indexed: %d, Skipped: %d, Errors: %d",
        job_id,
        dir,
        total_found,
        text_indexed,
        non_text_skipped,
        errors,
    )
    logger.info(
        "[job:%s] [VIDEO SUMMARY] Found: %d, Indexed: %d, Errors: %d",
        job_id,
        video_found,
        video_indexed,
        video_errors,
    )


# all indexing tasks need to be non blocking btw
@app.get("/api/index")
async def index(dir: str):
    job_id = uuid.uuid4().hex
    task = asyncio.create_task(_run_indexing_job(dir, job_id))
    task.add_done_callback(lambda t: _log_task_exception(t, job_id))
    return {"success": True, "job_id": job_id}


@app.get("/api/search")
async def api_search(q: str):
    from search import search_all, search_file_vids_together

    try:
        # result = await search_all(q, limit=10)
        result = await search_file_vids_together(q)
        return JSONResponse(result)
    except Exception as e:
        logger.error("Error searching videos: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# @app.post("/search")

# # JSON with search results needs to be sent back with error in case any.
# async def search(request: SearchRequest):
#     """
#     Search for videos across all stores for a user.
#     Returns video IDs and match details for videos containing the searched content.
#     """
#     from search import search_all

#     try:
#         result = await search_all(request.query, limit=request.limit)
#         return JSONResponse(result)
#     except Exception as e:
#         logger.error(f"Error searching: {e}")
#         raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    try:
        port_value = int(PORT) if PORT is not None else 8000
    except ValueError:
        port_value = 8000
    uvicorn.run(app, host="0.0.0.0", port=port_value)
