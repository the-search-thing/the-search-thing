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


async def search_videos(search_query: str, limit: int = 5, video_id=None) -> dict:
    """
    Search for videos matching the query and return video IDs with relevance info.

    Args:
        search_query: Natural language search query
        limit: Maximum number of results to consider
        video_id: Optional video ID to scope search to (from @mention)
    Returns:
        dict with:
            - video_ids: List of unique video IDs matching the query (ranked by relevance)
            - top_video_id: The most relevant video ID
            - matches: List of match details (chunk_id, content snippet, source type)
    """
    try:
        # TODO: add video_id to search params for @mention
        # if video_id:
        #     search_params = {
        #         "query": search_query,
        #         "limit": limit,
        #         "video_id": video_id,
        #     }
        # else:
        search_params = {"search_text": search_query}

        # Use CombinedSearchWithVideoId to get chunks with video_id in one query

        response = get_helix_client().query("CombinedSearchWithVideoId", search_params)
        result_data = response[0] if response else {}

        transcripts = result_data.get("transcripts", [])[:limit]
        transcript_chunks = result_data.get("transcript_chunks", [])
        frames = result_data.get("frames", [])[:limit]
        frame_chunks = result_data.get("frame_chunks", [])

        # Build chunk_id -> video_id mapping from chunk results
        chunk_to_video = build_chunk_to_video_map(transcript_chunks + frame_chunks)

    except Exception as e:
        print(f"CombinedSearchWithVideoId failed, falling back to CombinedSearch: {e}")
        # Fallback to old query
        response = get_helix_client().query("CombinedSearch", search_params)
        result_data = response[0] if response else {}

        transcripts = result_data.get("transcripts", [])[:limit]
        frames = result_data.get("frames", [])[:limit]
        chunk_to_video = {}

    # Get video_ids in ORDER of relevance (from the ranked search results)
    # The transcripts and frames are already ranked by Helix, so we preserve that order
    all_video_ids = []
    seen = set()

    # First, get video_ids from transcripts (in order of relevance)
    for item in transcripts:
        chunk_id = item.get("chunk_id", "")
        video_id = chunk_to_video.get(chunk_id)
        if video_id and video_id not in seen:
            seen.add(video_id)
            all_video_ids.append(video_id)

    # Then, get video_ids from frames (in order of relevance)
    for item in frames:
        chunk_id = item.get("chunk_id", "")
        video_id = chunk_to_video.get(chunk_id)
        if video_id and video_id not in seen:
            seen.add(video_id)
            all_video_ids.append(video_id)

    # Build match details for debugging/display
    matches = []
    for item in transcripts:
        chunk_id = item.get("chunk_id", "")
        video_id = chunk_to_video.get(chunk_id)
        content = item.get("content", "")[:200]  # Truncate for preview
        matches.append(
            {
                "video_id": video_id,
                "chunk_id": chunk_id,
                "content_preview": content,
                "source": "transcript",
            }
        )

    for item in frames:
        chunk_id = item.get("chunk_id", "")
        video_id = chunk_to_video.get(chunk_id)
        content = item.get("content", "")[:200]
        matches.append(
            {
                "video_id": video_id,
                "chunk_id": chunk_id,
                "content_preview": content,
                "source": "frame",
            }
        )

    return {
        "video_ids": all_video_ids,
        "top_video_id": all_video_ids[0] if all_video_ids else None,
        "matches": matches,
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
