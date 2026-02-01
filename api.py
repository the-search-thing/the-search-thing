import asyncio
import json
import logging
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
PORT = os.getenv("PORT")


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

app = FastAPI(title="the search thing")

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


@app.get("/api/check")
# send a boolean value
async def index_exists():
    return {"Hello": "World"}


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


def _handle_by_category(category: str, path: str) -> None:
    """Placeholder: do something per file type (video, image, text, code)."""
    match category:
        case "video":
            print("video", path)
        case "image":
            print("image", path)
        case "text":
            print("text", path)
        case _:
            print(
                "you are a stupid mothasucka this shit not in the allowed list gang",
                path,
            )


# all indexing tasks need to be non blocking btw
@app.get("/api/index")
async def index(dir: str):
    from pathlib import Path

    from the_search_thing import (
        walk_and_get_files,  # ty: ignore[unresolved-import]
    )

    ext_to_category = _load_extension_to_category()
    paths = walk_and_get_files(dir)
    # if paths is None:
    # paths = []

    count = 0
    for path in paths:
        # if not os.path.isfile(path):
        # continue
        ext = Path(path).suffix.lower()
        category = ext_to_category.get(ext)
        if category is not None:
            _handle_by_category(category, path)
            count += 1

    return {"indexed": count}


@app.post("/search")

# JSON with search results needs to be sent back with error in case any.
async def search(request: SearchRequest):
    """
    Search for videos across all stores for a user.
    Returns video IDs and match details for videos containing the searched content.
    """
    from search import search_videos

    try:
        result = await search_videos(
            request.query,
            limit=request.limit,
        )

        return JSONResponse(
            {
                "success": True,
                "top_video_id": result.get("top_video_id"),
                "video_ids": result.get("video_ids"),
                "matches": result.get("matches"),
                "query": result.get("query"),
            }
        )
    except Exception as e:
        logger.error(f"Error searching: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    try:
        port_value = int(PORT) if PORT is not None else 8000
    except ValueError:
        port_value = 8000
    uvicorn.run(app, host="0.0.0.0", port=port_value)
