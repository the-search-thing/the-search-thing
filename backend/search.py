import asyncio 
import re
import sys

from dotenv import load_dotenv

from backend.services.search import (
    _build_video_to_path_map,
    _extract_list_response,
    build_chunk_to_video_map,
)
from backend.utils.clients import get_helix_client

load_dotenv()


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

    return {
        "success": True,
        "response": helix_response,
        "results": results,
        "query": search_query,
    }


async def search_files(search_query: str, limit: int = 10) -> dict:
    """
    Search file embeddings and return raw results plus LLM summary.
    """
    search_params = {"search_text": search_query, "limit": limit}
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

    return {"response": helix_response, "results": results, "query": search_query}


async def search_images(search_query: str, limit: int = 10) -> dict:
    """
    Search across image embeddings and return file-style results.
    """
    search_params = {"query": search_query, "limit": limit}
    response = get_helix_client().query("SearchImageEmbeddings", search_params)

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
                    "image_id": entry.get("image_id"),
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

    helix_response = f"Image search results: {top_contents}"

    return {"response": helix_response, "results": results, "query": search_query}


async def goated_search(search_query: str) -> dict:
    file_search_params = {"search_text": search_query}
    video_search_params = {"search_text": search_query}
    image_search_params = {"search_text": search_query}
    helix_client = get_helix_client()

    (
        file_search_results,
        video_search_results,
        image_search_results,
    ) = await asyncio.gather(
        asyncio.to_thread(
            helix_client.query, "SearchFileEmbeddings", file_search_params
        ),
        asyncio.to_thread(
            helix_client.query,
            "SearchTranscriptAndFrameEmbeddings",
            video_search_params,
        ),
        asyncio.to_thread(
            helix_client.query, "SearchImageEmbeddings", image_search_params
        ),
        return_exceptions=True,
    )

    for label, result in (
        ("file", file_search_results),
        ("video", video_search_results),
        ("image", image_search_results),
    ):
        if isinstance(result, BaseException):
            print(f"{label} search failed: {result}")

    file_items: list[dict] = []
    video_items: list[dict] = []
    image_items: list[dict] = []

    from typing import Any, cast

    JSONDict = dict[str, Any]

    def normalize_file_results(response: object) -> None:

        if not response:
            return

        items: list[object] = []
        if isinstance(response, dict) and "chunks" in response:
            response_dict = cast(JSONDict, response)
            chunks = response_dict.get("chunks")
            if isinstance(chunks, list):
                items = chunks
            else:
                return
        elif isinstance(response, list):
            for entry in response:
                if isinstance(entry, dict) and "chunks" in entry:
                    entry_dict = cast(JSONDict, entry)
                    chunks = entry_dict.get("chunks")
                    if isinstance(chunks, list):
                        items.extend(chunks)
                    continue
                items.append(entry)
        else:
            items = [response]
        for item in items:
            if isinstance(item, dict) and "text" in item:
                item_dict = cast(JSONDict, item)
                text_val = item_dict.get("text")
                if isinstance(text_val, list):
                    entries = text_val
                else:
                    entries = [item]
            else:
                entries = [item]
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                entry_dict = cast(JSONDict, entry)
                file_id = entry_dict.get("file_id") or entry_dict.get("id")
                content = entry_dict.get("content")
                path = entry_dict.get("path")
                if not (file_id or content or path):
                    continue
                normalized = {
                    "label": "file",
                    "file_id": file_id,
                    "content": content,
                    "path": path,
                }
                file_items.append(normalized)

    def collect_video_entries(value: object, entries: list[dict]) -> None:
        if isinstance(value, list):
            for entry in value:
                collect_video_entries(entry, entries)
            return
        if isinstance(value, dict):
            if any(
                key in value
                for key in ("chunk_id", "video_id", "file_id", "path", "content")
            ):
                entries.append(value)
                return
            for nested in value.values():
                collect_video_entries(nested, entries)

    def normalize_video_results(response: object) -> None:
        if not response:
            return
        entries: list[dict] = []
        if isinstance(response, dict):
            response_dict = cast(JSONDict, response)
            transcript_videos = response_dict.get("transcript_videos")
            frame_videos = response_dict.get("frame_videos")
            if isinstance(transcript_videos, list):
                entries.extend(transcript_videos)
            if isinstance(frame_videos, list):
                entries.extend(frame_videos)
            if not entries:
                collect_video_entries(response, entries)
        elif isinstance(response, list):
            collect_video_entries(response, entries)
        else:
            return
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            entry_dict = cast(JSONDict, entry)
            chunk_id = entry_dict.get("chunk_id")
            video_id = entry_dict.get("video_id")
            file_id = entry_dict.get("file_id") or entry_dict.get("id")
            content = entry_dict.get("content")
            path = entry_dict.get("path")
            if not (chunk_id or video_id or file_id or content or path):
                continue
            normalized = {
                "label": "video",
                "chunk_id": chunk_id,
                "video_id": video_id,
                "file_id": file_id,
                "content": content,
                "path": path,
            }
            video_items.append(normalized)

        if not video_items:
            return
        deduped: list[dict] = []
        seen: set[tuple] = set()
        for item in video_items:
            key = (
                item.get("video_id"),
                item.get("chunk_id"),
                item.get("file_id"),
                item.get("path"),
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        video_items.clear()
        video_items.extend(deduped)

    def normalize_image_results(response: object) -> None:
        if not response:
            return
        items: list[object] = []
        if isinstance(response, dict) and "images" in response:
            response_dict = cast(JSONDict, response)
            images = response_dict.get("images")
            if isinstance(images, list):
                items = images
            else:
                return
        elif isinstance(response, list):
            for entry in response:
                if isinstance(entry, dict) and "images" in entry:
                    entry_dict = cast(JSONDict, entry)
                    images = entry_dict.get("images")
                    if isinstance(images, list):
                        items.extend(images)
                    continue
                items.append(entry)
        else:
            items = [response]

        for item in items:
            if isinstance(item, dict) and "text" in item:
                item_dict = cast(JSONDict, item)
                text_val = item_dict.get("text")
                if isinstance(text_val, list):
                    entries = text_val
                else:
                    entries = [item]
            else:
                entries = [item]
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                entry_dict = cast(JSONDict, entry)
                image_id = entry_dict.get("image_id") or entry_dict.get("id")
                content = entry_dict.get("content")
                path = entry_dict.get("path")
                if not (image_id or content or path):
                    continue
                normalized = {
                    "label": "image",
                    "image_id": image_id,
                    "content": content,
                    "path": path,
                }
                image_items.append(normalized)

        if not image_items:
            return
        deduped: list[dict] = []
        seen: set[tuple] = set()
        for item in image_items:
            key = (
                item.get("image_id"),
                item.get("path"),
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        image_items.clear()
        image_items.extend(deduped)

    if not isinstance(file_search_results, BaseException):
        normalize_file_results(file_search_results)
    if not isinstance(video_search_results, BaseException):
        normalize_video_results(video_search_results)
    if not isinstance(image_search_results, BaseException):
        normalize_image_results(image_search_results)

    keywords = re.findall(r"\w+", search_query.lower())

    def has_keyword_match(item: dict) -> bool:
        if not keywords:
            return False
        content = item.get("content")
        path = item.get("path")
        content_lower = content.lower() if isinstance(content, str) else ""
        path_lower = path.lower() if isinstance(path, str) else ""
        return any(
            keyword in content_lower or keyword in path_lower for keyword in keywords
        )

    def attach_rank_score(items: list[dict], source: str) -> None:
        for rank, item in enumerate(items, start=1):
            item["rank"] = rank
            score = 1 / (rank + 60)
            if has_keyword_match(item):
                score *= 1.2
            item["score"] = score
            item["source"] = source

    attach_rank_score(file_items, "file")
    attach_rank_score(video_items, "video")
    attach_rank_score(image_items, "image")

    combined = file_items + video_items + image_items
    combined.sort(
        key=lambda item: (
            item.get("score", 0),
            1 if item.get("source") == "video" else 0,
        ),
        reverse=True,
    )

    deduped: list[dict] = []
    seen: set[tuple] = set()
    for item in combined:
        key = (
            item.get("label"),
            item.get("file_id") or item.get("chunk_id"),
            item.get("video_id"),
            item.get("image_id"),
            item.get("path"),
            item.get("content"),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return {
        "query": search_query,
        "results": deduped,
    }


async def search_file_vids_together(search_query: str) -> dict:
    """
    Search files and videos together using CombinedFileAndVideo.
    Returns a combined results list without file/video grouping.
    """

    search_params = {"search_text": search_query}
    response = get_helix_client().query("helixCombinedFileVideo", search_params)

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


async def search_file_vids_imgs_together(search_query: str) -> dict:
    search_params = {"search_text": search_query}
    response = get_helix_client().query("CombinedFileVidAndImage", search_params)

    file_items: list[dict] = []
    video_items: list[dict] = []
    img_items: list[dict] = []

    def normalize_item(item: dict) -> None:
        label = item.get("label")
        if not isinstance(label, str) or not label:
            return
        label_lower = label.lower()
        path = item.get("path")
        if not isinstance(path, str) or not path:
            return
        content = item.get("content")
        if label_lower == "video":
            content = None
        normalized = {"label": label, "content": content, "path": path}
        if label_lower == "file":
            file_items.append(normalized)
        elif label_lower == "image":
            img_items.append(normalized)
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

    if has_file_match:
        ordered = file_items + video_items + img_items
    else:
        ordered = video_items + file_items + img_items

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
    file_result, video_result, image_result = await asyncio.gather(
        search_files(search_query, limit=limit),
        search_videos(search_query, limit=limit),
        search_images(search_query, limit=limit),
    )

    return {
        "success": True,
        "files": file_result.get("results", []),
        "videos": video_result.get("results", []),
        "images": image_result.get("results", []),
    }


if __name__ == "__main__":
    search_query = sys.argv[1] if len(sys.argv) > 1 else "zed industries"

    print("=== Testing goated_search (RRF) ===")
    result = asyncio.run(goated_search(search_query))
    print(f"Results count: {len(result.get('results', []))}")
    for item in result.get("results", [])[:10]:
        print(item)
