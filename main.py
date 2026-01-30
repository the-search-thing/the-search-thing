import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
PORT = os.getenv("PORT")


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

app = FastAPI(title="Search Engine Backend API")

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


@app.post("/search")
async def search(request: SearchRequest):
    """
    Search for videos across all stores for a user.
    Returns video IDs and match details for videos containing the searched content.

    Note: Currently searches globally. User-scoped search to be implemented.
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
