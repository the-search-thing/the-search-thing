from typing import Any, cast


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

