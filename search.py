import asyncio
import os
import re
import sys
from typing import Any, cast

from dotenv import load_dotenv
from google import genai
from google.genai import types

from utils.clients import get_helix_client

load_dotenv()


def build_chunk_to_video_map(chunks: list) -> dict[str, str]:
    """
    Build a mapping from chunk_id to video_id from the chunk results.
    """
    mapping = {}
    for chunk in chunks:
        if isinstance(chunk, dict):
            chunk_id = chunk.get("chunk_id", "")
            video_id = chunk.get("video_id", "")
            if chunk_id and video_id:
                mapping[chunk_id] = video_id
    return mapping


def get_video_ids_from_chunks(chunks: list) -> list[str]:
    """
    Extract unique video_ids from chunk results.
    """
    video_ids = set()
    for chunk in chunks:
        if isinstance(chunk, dict):
            video_id = chunk.get("video_id", "")
            if video_id:
                video_ids.add(video_id)
    return list(video_ids)


def _extract_list_response(response: object, key: str) -> list:
    if isinstance(response, list) and response:
        first = response[0]
        if isinstance(first, dict):
            first_dict = cast(dict[str, Any], first)
            nested = first_dict.get(key)
            if isinstance(nested, list):
                return nested
        return response
    if isinstance(response, dict):
        response_dict = cast(dict[str, Any], response)
        nested = response_dict.get(key)
        if isinstance(nested, list):
            return nested
    return []


def _build_video_to_path_map(videos: list) -> dict[str, str]:
    video_to_path: dict[str, str] = {}
    for video in videos:
        if not isinstance(video, dict):
            continue
        video_id = video.get("video_id")
        path = video.get("path")
        if video_id and path:
            video_to_path[video_id] = path
    return video_to_path


async def llm_responses_search(query: str, helix_response: str) -> str:
    """
    Format Helix DB search results using Gemini LLM.
    Returns formatted LLM response, or raw helix_response if LLM call fails.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        print("GEMINI_API_KEY environment variable is not set")
        return helix_response

    gemini_client = genai.Client(api_key=gemini_api_key)

    try:
        gemini_response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                f"use the user's query: {query} and the semantic search results: {helix_response} & respond to the user's request to the best of your ability, in 3-7 sentences."
            ],
            config=types.GenerateContentConfig(temperature=0.5),
        )
        gemini_response_text = str(gemini_response.text)
        return gemini_response_text
    except Exception as e:
        print(f"error calling gemini api {e}")
        print(f"raw helix response: {helix_response}")
        return helix_response


async def search_combined(search_query: str) -> str:
    """
    Search across transcripts and frames, return LLM-formatted response.
    """
    search_params = {"search_text": search_query}
    response = get_helix_client().query("CombinedSearch", search_params)

    # Extract the actual content from the embedding results (top 5 from each)
    transcript_contents = [
        item.get("content", "") for item in response[0].get("transcripts", [])[:5]
    ]
    frame_contents = [
        item.get("content", "") for item in response[0].get("frames", [])[:5]
    ]

    helix_response = f"Transcripts: {transcript_contents}\n\nFrames: {frame_contents}"
    return await llm_responses_search(search_query, helix_response)


async def search_files(search_query: str, limit: int = 10) -> dict:
    """
    Search file embeddings and return raw results plus LLM summary.
    """
    search_params = {"query": search_query, "limit": limit}
    response = get_helix_client().query("SearchFileEmbeddings", search_params)

    results: list[dict] = []
    top_contents: list[str] = []

    for item in response or []:
        if (
            isinstance(item, dict)
            and "text" in item
            and isinstance(item.get("text"), list)
        ):
            entries = item.get("text", [])
        else:
            entries = [item]

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            results.append(
                {
                    "file_id": entry.get("file_id"),
                    "content": entry.get("content"),
                    "path": entry.get("path"),
                }
            )
            content = entry.get("content")
            if isinstance(content, str) and content:
                top_contents.append(content)
            if len(results) >= limit:
                break
        if len(results) >= limit:
            break

    helix_response = f"File search results: {top_contents}"
    summary = await llm_responses_search(search_query, helix_response)

    return {"summary": summary, "results": results, "query": search_query}


async def search_videos(search_query: str, limit: int = 5) -> dict:
    """
    Search across transcript + frame summary embeddings and return file-style results.
    """
    search_params = {"search_text": search_query}
    response = get_helix_client().query("CombinedSearch", search_params)
    result_data = response[0] if response else {}

    transcripts = result_data.get("transcripts", [])
    frames = result_data.get("frames", [])

    chunk_to_video: dict[str, str] = {}
    video_to_path: dict[str, str] = {}

    combined_videos = []
    combined_videos.extend(result_data.get("transcript_videos", []) or [])
    combined_videos.extend(result_data.get("frame_videos", []) or [])
    if combined_videos:
        video_to_path.update(_build_video_to_path_map(combined_videos))

    try:
        chunks_response = get_helix_client().query("GetAllChunks", {})
        chunks = _extract_list_response(chunks_response, "chunks")
        chunk_to_video = build_chunk_to_video_map(chunks or [])
    except Exception as e:
        print(f"GetAllChunks failed: {e}")

    try:
        videos_response = get_helix_client().query("GetAllVideos", {})
        videos = _extract_list_response(videos_response, "videos")
        video_to_path.update(_build_video_to_path_map(videos or []))
    except Exception as e:
        print(f"GetAllVideos failed: {e}")

    results: list[dict] = []
    top_contents: list[str] = []

    def append_results(items: list) -> None:
        for entry in items:
            if not isinstance(entry, dict):
                continue
            chunk_id = entry.get("chunk_id")
            if not isinstance(chunk_id, str) or not chunk_id:
                continue
            video_id = chunk_to_video.get(chunk_id)
            path = video_to_path.get(video_id) if isinstance(video_id, str) else None
            results.append(
                {
                    "file_id": chunk_id,
                    "content": None,
                    "path": path,
                }
            )
            content = entry.get("content")
            if isinstance(content, str) and content:
                top_contents.append(content)
            if len(results) >= limit:
                break

    append_results(transcripts)
    if len(results) < limit:
        append_results(frames)

    helix_response = f"Video search results: {top_contents}"
    summary = await llm_responses_search(search_query, helix_response)

    return {
        "success": True,
        "summary": summary,
        "results": results,
        "query": search_query,
    }


async def search_file_vids_together(search_query: str) -> dict:
    """
    Search files and videos together using CombinedFileAndVideo.
    Returns a combined results list without file/video grouping.
    """
    search_params = {"search_text": search_query}
    response = get_helix_client().query("CombinedFileAndVideo", search_params)

    file_items: list[dict] = []
    video_items: list[dict] = []

    def normalize_item(item: dict) -> None:
        label = item.get("label")
        if not isinstance(label, str) or not label:
            return
        path = item.get("path")
        if not isinstance(path, str) or not path:
            return
        content = item.get("content")
        if label.lower() == "video":
            content = None
        normalized = {"label": label, "content": content, "path": path}
        if label.lower() == "file":
            file_items.append(normalized)
        else:
            video_items.append(normalized)

    def handle_value(value: object) -> None:
        if isinstance(value, list):
            for entry in value:
                handle_value(entry)
            return
        if isinstance(value, dict):
            normalize_item(value)

    if isinstance(response, list):
        for item in response:
            if isinstance(item, dict):
                for value in item.values():
                    handle_value(value)
            else:
                handle_value(item)
    elif isinstance(response, dict):
        for value in response.values():
            handle_value(value)

    keywords = re.findall(r"\w+", search_query.lower())
    has_file_match = False
    if keywords:
        for item in file_items:
            content = item.get("content")
            if not isinstance(content, str) or not content:
                continue
            content_lower = content.lower()
            if any(keyword in content_lower for keyword in keywords):
                has_file_match = True
                break

    ordered = file_items + video_items if has_file_match else video_items + file_items

    deduped: list[dict] = []
    seen: set[tuple] = set()
    for item in ordered:
        key = (item.get("label"), item.get("content"), item.get("path"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return {"results": deduped}


async def search_all(search_query: str, limit: int = 10) -> dict:
    """
    Search files and videos in parallel and return grouped results.
    """
    file_result, video_result = await asyncio.gather(
        search_files(search_query, limit=limit),
        search_videos(search_query, limit=limit),
    )

    return {
        "success": True,
        # llm resposne
        # "summary": {
        #     "files": file_result.get("summary"),
        #     "videos": video_result.get("summary"),
        # },
        # helix response
        "files": file_result.get("results", []),
        "videos": video_result.get("results", []),
        # "query": search_query,
    }


if __name__ == "__main__":
    search_query = sys.argv[1] if len(sys.argv) > 1 else "zed industries"

    print("=== Testing search_file_vids_together ===")
    result = asyncio.run(search_file_vids_together(search_query))
    print(f"Results count: {len(result.get('results', []))}")
    for item in result.get("results", [])[:10]:
        print(item)
