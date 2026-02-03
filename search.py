import asyncio
import os

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

    try:
        chunks = get_helix_client().query("GetAllChunks", {})
        chunk_to_video = build_chunk_to_video_map(chunks or [])
    except Exception as e:
        print(f"GetAllChunks failed: {e}")

    try:
        videos = get_helix_client().query("GetAllVideos", {})
        for video in videos or []:
            if isinstance(video, dict):
                video_id = video.get("video_id")
                path = video.get("path")
                if video_id and path:
                    video_to_path[video_id] = path
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
        "summary": {
            "files": file_result.get("summary"),
            "videos": video_result.get("summary"),
        },
        "files": file_result.get("results", []),
        "videos": video_result.get("results", []),
        "query": search_query,
    }


if __name__ == "__main__":
    # Test the video search
    search_query = "what are the names of the founders and where are they sitting?"

    print("=== Testing search_videos ===")
    result = asyncio.run(search_videos(search_query))
    print(f"Query: {result['query']}")
    print(f"Top Video ID: {result['top_video_id']}")
    print(f"All Video IDs: {result['video_ids']}")
    print(f"\nMatches ({len(result['matches'])}):")
    for match in result["matches"][:3]:  # Show first 3 matches
        print(f"  - Video: {match['video_id']}, Source: {match['source']}")
        print(f"    Preview: {match['content_preview'][:100]}...")

    # print("\n=== Testing search_combined (LLM response) ===")
    # llm_response = asyncio.run(search_combined(search_query))
    # print(llm_response)
