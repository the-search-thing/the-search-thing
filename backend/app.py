import asyncio
import logging
import os
import re
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from backend.services.indexing import run_indexing_job
from backend.services.indexing_status import get_job

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


frontend_origin = os.getenv("FRONTEND_ORIGIN")
PORT = os.getenv("PORT")

app = FastAPI(title="the search thing")

REPO_ROOT = Path(__file__).resolve().parents[1]
THUMBNAILS_DIR = REPO_ROOT / "videos" / "thumbnails"

app.add_middleware(
    CORSMiddleware,  # type: ignore[ arg-type ]
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str
    limit: int = 10


def _log_task_exception(task: "asyncio.Task[None]", job_id: str) -> None:
    try:
        task.result()
    except Exception:
        logger.exception("[job:%s] Indexing job failed", job_id)


# all indexing tasks need to be non blocking btw
@app.get("/api/index")
async def index(dir: str):
    job_id = uuid.uuid4().hex
    task = asyncio.create_task(run_indexing_job(dir, job_id))
    task.add_done_callback(lambda t: _log_task_exception(t, job_id))
    return {"success": True, "job_id": job_id}


@app.get("/api/index/status")
async def index_status(job_id: str):
    record = get_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return record


@app.get("/api/search")
async def api_search(q: str):
    # from backend.search import search_files_vids_together
    from backend.search import goated_search

    try:
        # result = await search_file_vids_together(q)
        result = await goated_search(q)
        return JSONResponse(result)
    except Exception as e:
        logger.error("Error searching videos: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/thumbnails/{content_hash}")
async def get_thumbnail(content_hash: str):
    if not re.fullmatch(r"[a-fA-F0-9]{64}", content_hash):
        raise HTTPException(status_code=400, detail="Invalid thumbnail id")

    thumbnail_path = THUMBNAILS_DIR / f"{content_hash}.jpg"
    if not thumbnail_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    return FileResponse(str(thumbnail_path), media_type="image/jpeg")


if __name__ == "__main__":
    import uvicorn

    try:
        port_value = int(PORT) if PORT is not None else 8000
    except ValueError:
        port_value = 8000
    uvicorn.run(app, host="0.0.0.0", port=port_value)
