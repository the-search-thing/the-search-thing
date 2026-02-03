import asyncio
import base64
import json
import os
import sys
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Literal

from dotenv import load_dotenv
from google import genai
from google.genai import types
from the_search_thing import rust_indexer  # ty:ignore[unresolved-import]

from utils.clients import get_groq_client, get_helix_client

load_dotenv()


def transcribe_audio_file_groq(audio_path: Path | tuple[str, bytes]) -> dict:
    """
    Transcribe a single audio file using Groq API with word-level timestamps.
    Accepts Path (reads from file) or tuple[str, bytes] (chunk_key, audio_bytes).
    Returns transcription data directly without writing to filesystem.
    """
    client = get_groq_client()

    if isinstance(audio_path, tuple):
        chunk_key, file_content = audio_path
        file_arg: tuple[str, bytes] = (f"{chunk_key}.mp3", file_content)
        audio_label = chunk_key
    else:
        with open(audio_path, "rb") as file:
            file_content = file.read()
        file_arg = (audio_path.name, file_content)
        audio_label = str(audio_path)

    try:
        granularities: List[Literal["word", "segment"]] = ["word"]
        transcription = client.audio.transcriptions.create(
            file=file_arg,
            model="whisper-large-v3-turbo",
            temperature=0,
            response_format="verbose_json",
            timestamp_granularities=granularities,
        )

        transcript_dict = (
            transcription.model_dump()
            if hasattr(transcription, "model_dump")
            else transcription.__dict__
            if hasattr(transcription, "__dict__")
            else dict(transcription)
        )
        result_segments: list[dict] = []
        result = {
            "audio_file": audio_label,
            "language": transcript_dict.get("language", "en"),
            "duration": round(transcript_dict.get("duration", 0), 3),
            "segments": [],
        }

        segments = transcript_dict.get("segments")
        if segments is None:
            segments = []

        direct_words = list(transcript_dict.get("words", []))

        if segments:
            for idx, segment in enumerate(segments):
                if not isinstance(segment, dict):
                    segment = (
                        segment.model_dump()
                        if hasattr(segment, "model_dump")
                        else segment.__dict__
                        if hasattr(segment, "__dict__")
                        else dict(segment)
                    )

                segment_data = {
                    "id": segment.get("id", idx),
                    "start": round(segment.get("start", 0), 3),
                    "end": round(segment.get("end", 0), 3),
                    "text": segment.get("text", "").strip(),
                    "words": [],
                }

                words = list(segment.get("words", []))
                if words:
                    for word in words:
                        if not isinstance(word, dict):
                            word = (
                                word.model_dump()
                                if hasattr(word, "model_dump")
                                else word.__dict__
                                if hasattr(word, "__dict__")
                                else dict(word)
                            )
                        segment_data["words"].append(
                            {
                                "word": word.get("word", "").strip(),
                                "start": round(word.get("start", 0), 3),
                                "end": round(word.get("end", 0), 3),
                                "probability": round(word.get("probability", 1.0), 4),
                            }
                        )
                result_segments.append(segment_data)

        elif direct_words and isinstance(direct_words, list) and len(direct_words) > 0:
            all_words = []
            for word in direct_words:
                if not isinstance(word, dict):
                    word = (
                        word.model_dump()
                        if hasattr(word, "model_dump")
                        else word.__dict__
                        if hasattr(word, "__dict__")
                        else dict(word)
                    )
                all_words.append(
                    {
                        "word": word.get("word", "").strip(),
                        "start": round(word.get("start", 0), 3),
                        "end": round(word.get("end", 0), 3),
                        "probability": round(word.get("probability", 1.0), 4),
                    }
                )

            result_segments.append(
                {
                    "id": 0,
                    "start": all_words[0]["start"] if all_words else 0.0,
                    "end": all_words[-1]["end"] if all_words else result["duration"],
                    "text": transcript_dict.get("text", "").strip(),
                    "words": all_words,
                }
            )

        if not result["segments"] and transcript_dict.get("text"):
            result_segments.append(
                {
                    "id": 0,
                    "start": 0.0,
                    "end": result["duration"],
                    "text": transcript_dict["text"].strip(),
                    "words": [],
                }
            )

        total_words = sum(
            len(list(s.get("words", [])))
            for s in result["segments"]
            if isinstance(s, dict)
        )
        print(
            f"[OK] Transcribed: {audio_label} ({len(result['segments'])} segments, {total_words} words)"
        )
        return result

    except Exception as e:
        print(f"[ERROR] Failed to transcribe {audio_label}: {e}")

        traceback.print_exc()
        return {"audio_file": audio_label, "error": str(e)}


async def generate_transcripts(audio_data: dict[str, bytes]) -> dict[str, dict]:
    """
    Transcribe audio from in-memory dict (chunk_key -> audio bytes).
    Processes 4 at a time in parallel using Groq API.
    Returns dict mapping chunk_key to transcription data. No file I/O.
    """
    if not audio_data:
        print("No audio data provided")
        return {}

    print(f"Transcribing {len(audio_data)} audio chunk(s)")
    print("Processing 4 at a time in parallel...")

    loop = asyncio.get_event_loop()
    max_workers = 4

    def process_batch():
        results = {}
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_key = {
                executor.submit(transcribe_audio_file_groq, (k, v)): k
                for k, v in audio_data.items()
            }

            for future in as_completed(future_to_key):
                chunk_key = future_to_key[future]
                try:
                    result = future.result()
                    results[chunk_key] = result
                except Exception as e:
                    print(f"[ERROR] Exception for {chunk_key}: {e}")
                    results[chunk_key] = {
                        "audio_file": chunk_key,
                        "error": str(e),
                    }

        return results

    results = await loop.run_in_executor(None, process_batch)

    successful = len([r for r in results.values() if "error" not in r])
    failed = len([r for r in results.values() if "error" in r])

    print("\n[OK] Transcription complete!")
    print(f"  Total: {len(audio_data)}, Successful: {successful}, Failed: {failed}")
    return results


def _bytes_to_data_uri(image_bytes: bytes, mime_hint: str = "jpeg") -> str:
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:image/{mime_hint};base64,{encoded}"


def _normalize_summary_content(content_str: str) -> dict:
    """
    Normalize model output into a JSON-friendly dict without code fences.
    Accepts raw text (possibly with ```json fences) and tries to JSON-parse.
    Falls back to wrapping the text under 'summary'.
    """
    text = content_str.strip()

    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    parsed_obj = None
    try:
        parsed_obj = json.loads(text)
    except Exception:
        parsed_obj = None

    if not isinstance(parsed_obj, dict):
        return {"summary": text}

    summary_text = parsed_obj.get("summary")
    if isinstance(summary_text, str) and summary_text.strip().startswith("```"):
        nested = _normalize_summary_content(summary_text)
        if isinstance(nested, dict):
            summary_text = nested.get("summary", summary_text)

    objects = (
        parsed_obj.get("objects") if isinstance(parsed_obj.get("objects"), list) else []
    )
    actions = (
        parsed_obj.get("actions") if isinstance(parsed_obj.get("actions"), list) else []
    )
    setting = (
        parsed_obj.get("setting") if isinstance(parsed_obj.get("setting"), str) else ""
    )
    quality = (
        parsed_obj.get("quality") if isinstance(parsed_obj.get("quality"), str) else ""
    )

    if summary_text is None:
        summary_text = text

    return {
        "summary": summary_text,
        "objects": objects,
        "actions": actions,
        "setting": setting,
        "quality": quality,
    }


async def generate_frame_summaries(
    thumbnails_data: dict[str, list[bytes]],
) -> dict[str, list[dict]]:
    """
    Summarize thumbnails from in-memory dict (chunk_key -> list of image bytes).
    Returns dict mapping chunk_key to list of summary entries. No file I/O.
    """
    if not thumbnails_data:
        print("[WARN] No thumbnails data provided")
        return {}

    client = get_groq_client()
    batch_size = 5
    max_workers = 4

    # Flatten to (chunk_key, image_index, image_bytes) for batching
    flat_items: list[tuple[str, int, bytes]] = []
    for chunk_key, images in thumbnails_data.items():
        for i, img_bytes in enumerate(images):
            flat_items.append((chunk_key, i, img_bytes))

    total_images = len(flat_items)
    print(
        f"Found {total_images} thumbnails across {len(thumbnails_data)} chunk(s). "
        f"Processing {batch_size} images per request across {max_workers} threads."
    )

    def summarize_image_bytes(
        image_id: str, image_bytes: bytes, mime_hint: str = "jpeg"
    ) -> dict:
        data_uri = _bytes_to_data_uri(image_bytes, mime_hint)
        prompt = (
            "You are an expert vision assistant. Provide a concise JSON summary for "
            "the provided video frame. Respond with JSON only (no code fences). Use the schema: "
            '{"summary": "<1-2 sentences>", "objects": ["..."], "actions": ["..."], '
            '"setting": "<location or scene>", "quality": "<good|low>"}'
        )
        response = client.chat.completions.create(
            model="meta-llama/llama-4-maverick-17b-128e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }
            ],
            max_tokens=500,
            temperature=0.2,
        )
        content = response.choices[0].message.content
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, dict) and "text" in part:
                    parts.append(part["text"])
                else:
                    parts.append(str(part))
            content = " ".join(parts)
        summary_payload = (
            _normalize_summary_content(content)
            if isinstance(content, str)
            else {"summary": str(content)}
        )
        return {"image": image_id, "summary": summary_payload}

    def process_batch(batch: list[tuple[str, int, bytes]]) -> list[dict]:
        batch_results = []
        for chunk_key, idx, img_bytes in batch:
            image_id = f"{chunk_key}_{idx}"
            try:
                batch_results.append(summarize_image_bytes(image_id, img_bytes, "jpeg"))
            except Exception as batch_err:
                batch_results.append(
                    {"image": image_id, "summary": None, "error": str(batch_err)}
                )
        return batch_results

    def run_batches():
        results = []
        batches = [
            flat_items[i : i + batch_size]
            for i in range(0, len(flat_items), batch_size)
        ]
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_batch = {
                executor.submit(process_batch, batch): batch for batch in batches
            }
            for future in as_completed(future_to_batch):
                results.extend(future.result())
        return results

    loop = asyncio.get_event_loop()
    raw_results = await loop.run_in_executor(None, run_batches)

    grouped: dict[str, list[dict]] = {}
    for entry in raw_results:
        image_id = entry["image"]
        chunk_key = image_id.rsplit("_", 1)[0] if "_" in image_id else image_id
        grouped.setdefault(chunk_key, []).append(entry)

    for chunk_key, entries in grouped.items():
        print(f"[OK] Summarized {len(entries)} frames for chunk {chunk_key}")

    return grouped


# create video node
async def create_video(video_id: str, no_of_chunks: int, path: str) -> str:
    helix_client = get_helix_client()
    video_params = {"video_id": video_id, "no_of_chunks": no_of_chunks, "path": path}
    return json.dumps(helix_client.query("CreateVideo", video_params))


# create chunk node
async def create_chunk(
    video_id: str,
    chunk_id: str,
    start_time: int,
    end_time: int,
    transcript: str,
) -> str:
    helix_client = get_helix_client()
    chunk_params = {
        "video_id": str(video_id),
        "chunk_id": str(chunk_id),
        "start_time": start_time,
        "end_time": end_time,
        "transcript": transcript,
    }
    return json.dumps(helix_client.query("CreateChunk", chunk_params))


# create transcript node
async def create_transcript_node(
    chunk_id: str,
    content: str,
) -> str:
    helix_client = get_helix_client()
    transcript_params = {
        "chunk_id": str(chunk_id),
        "content": content,
    }
    return json.dumps(helix_client.query("CreateTranscript", transcript_params))


# create frame summary node
async def create_frame_summary_node(
    chunk_id: str,
    content: str,
) -> str:
    helix_client = get_helix_client()
    frame_summary_params = {
        "chunk_id": str(chunk_id),
        "content": content,
    }
    return json.dumps(helix_client.query("CreateFrameSummary", frame_summary_params))


# create edge to connect video and chunk
async def create_video_chunk_relationship(video_id: str, chunk_id: str) -> str:
    helix_client = get_helix_client()
    return json.dumps(
        helix_client.query(
            "CreateVideoToChunkRelationship",
            {"video_id": str(video_id), "chunk_id": str(chunk_id)},
        )
    )


# create edge to connect video and chunk
async def create_chunk_transcript_relationship(
    chunk_id: str, transcript_id: str
) -> str:
    helix_client = get_helix_client()
    return json.dumps(
        helix_client.query(
            "CreateChunkToTranscriptRelationship",
            {"chunk_id": str(chunk_id), "transcript_id": str(transcript_id)},
        )
    )


# create edge to connect video and chunk
async def create_chunk_frame_summary_relationship(
    chunk_id: str, frame_summary_id: str
) -> str:
    helix_client = get_helix_client()
    return json.dumps(
        helix_client.query(
            "CreateChunkToFrameSummaryRelationship",
            {"chunk_id": str(chunk_id), "frame_summary_id": str(frame_summary_id)},
        )
    )


# create & connect to chunk node (also embeds content)
async def create_transcript_embeddings(chunk_id: str, content: str) -> str:
    helix_client = get_helix_client()
    return json.dumps(
        helix_client.query(
            "CreateTranscriptEmbeddings",
            {"chunk_id": chunk_id, "content": content},
        )
    )


# create & connect to chunk node (also embeds content)
async def create_frame_summary_embeddings(chunk_id: str, content: str) -> str:
    helix_client = get_helix_client()
    return json.dumps(
        helix_client.query(
            "CreateFrameSummaryEmbeddings",
            {"chunk_id": chunk_id, "content": content},
        )
    )


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


# TODO: need to add a separation of what video the useris asking about


# Now we search based on video_id
async def search_transcript_embeddings(query: str, limit: int, video_id) -> str:
    helix_client = get_helix_client()
    search_transcript_params = {"query": query, "limit": limit, "video_id": video_id}
    response = helix_client.query(
        "SearchTranscriptEmbeddingsVideo", search_transcript_params
    )
    return await llm_responses_search(query, json.dumps(response))


# TODO: need to add a separation of what video the user is asking about


# Now we search based on video_id
async def search_frame_summary_embeddings(query: str, limit: int, video_id) -> str:
    helix_client = get_helix_client()
    search_frame_summary_params = {"query": query, "limit": limit, "video_id": video_id}
    response = helix_client.query(
        "SearchFrameSummaryEmbeddingsVideo", search_frame_summary_params
    )
    return await llm_responses_search(query, json.dumps(response))


async def indexer_function(
    video_id,
    video_paths: List[str] | str,
) -> List[dict]:
    backend_dir = Path(__file__).parent.parent

    # Normalize input to list
    if isinstance(video_paths, str):
        video_paths = [video_paths]

    if not video_paths:
        print("No video paths provided. Exiting indexer.")
        return []

    # Build video items with UUIDs
    video_items = []
    for path in video_paths:
        video_items.append(
            {
                "path": path,
                "video_id": str(video_id),
                "filename": os.path.basename(path),
            }
        )

    # Setup output directories
    output_dir = Path(backend_dir / "videos/output_indexer")
    chunks_dir = output_dir / "chunks"
    audio_dir = output_dir / "audio"
    thumbnails_dir = output_dir / "thumbnails"

    chunks_dir.mkdir(parents=True, exist_ok=True)
    audio_dir.mkdir(parents=True, exist_ok=True)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)

    print(f"Indexing {len(video_items)} video(s)")
    print(f"Output dir: {output_dir}")
    print("Created directories: chunks/, audio/, thumbnails/")

    for item in video_items:
        print(
            f"  {item['path']}: exists={os.path.exists(item['path'])}, video_id={item['video_id']}"
        )

    try:
        print("\n=== Step 1 & 2: Chunking + Audio/Thumbnail Extraction (Rust) ===")
        paths_for_rust = [item["path"] for item in video_items]
        results = rust_indexer(paths_for_rust, 30.0, str(output_dir))
        num_of_chunks = len(results) if results else 0
        print(f"\nGot {num_of_chunks} chunk results:")
        for r in results:
            chunk_path, audio_path, thumbnails = r.split("|")
            thumb_start, thumb_mid, thumb_end = thumbnails.split(",")
            print(f"Chunk: {chunk_path}")
            print(f"  Audio: {audio_path}")
            print(f"  Thumbnails: {thumb_start}, {thumb_mid}, {thumb_end}")
    except Exception as e:
        print(f"\nERROR during Rust indexing: {e}")
        import traceback

        traceback.print_exc()
        raise

    # Build in-memory dicts from Rust output (one-time read)
    audio_data: dict[str, bytes] = {}
    thumbnails_data: dict[str, list[bytes]] = {}
    for r in results:
        try:
            chunk_path, audio_path, thumbnails_str = r.split("|")
        except ValueError:
            continue
        chunk_stem = Path(chunk_path).stem
        if audio_path != "NO_AUDIO":
            audio_p = Path(audio_path)
            if audio_p.exists():
                audio_data[audio_p.stem] = audio_p.read_bytes()
        thumb_paths = [p.strip() for p in thumbnails_str.split(",")]
        if thumb_paths:
            thumbnails_data[chunk_stem] = []
            for p in thumb_paths:
                tp = Path(p.strip())
                if tp.exists():
                    thumbnails_data[chunk_stem].append(tp.read_bytes())

    transcript_results = await generate_transcripts(audio_data)
    frame_summary_results = await generate_frame_summaries(thumbnails_data)
    indexed_videos = []

    for item in video_items:
        video_id = item["video_id"]
        video_path = item["path"]

        # Create video node
        await create_video(video_id, num_of_chunks, path=video_path)
        print(f"[OK] Created video node: {video_id} with {num_of_chunks} chunks")

        # Create chunk nodes for this video
        # Use transcription JSON files to derive actual duration and transcript.
        cumulative_time = 0.0
        chunks_created = 0

        for r in results:
            # Each result from rust_indexer is: "chunk_path|audio_path|thumbnails"
            try:
                chunk_path, audio_path, _ = r.split("|")
            except ValueError:
                print(f"[WARN] Unexpected rust_indexer result format: {r}")
                continue

            if audio_path == "NO_AUDIO":
                print(
                    f"[INFO] Video chunk has no audio, skipping transcription: {chunk_path}"
                )
                continue

            audio_stem = Path(audio_path).stem
            chunk_stem = Path(chunk_path).stem
            transcript_data = transcript_results.get(audio_stem)

            if not transcript_data or "error" in transcript_data:
                print(f"[WARN] Missing or failed transcription for chunk: {chunk_stem}")
                continue

            raw_transcript_json = json.dumps(transcript_data, ensure_ascii=False)

            # Duration is the actual length of this chunk in seconds (float)
            duration = transcript_data.get("duration", 30.0)
            segments = transcript_data.get("segments", [])

            transcript_text = " ".join(
                str(seg.get("text", "")) for seg in segments
            ).strip()

            # Calculate timing using cumulative duration so far
            start_time = cumulative_time
            end_time = cumulative_time + float(duration)
            cumulative_time = end_time

            start_time_int = int(start_time)
            end_time_int = int(end_time)

            # Generate unique chunk_id
            chunk_id = str(uuid.uuid4())

            # Create chunk node
            await create_chunk(
                video_id=video_id,
                chunk_id=chunk_id,
                start_time=start_time_int,
                end_time=end_time_int,
                transcript=transcript_text,
            )

            # Create relationship between video and chunk
            await create_video_chunk_relationship(video_id, chunk_id)
            chunks_created += 1

            await create_transcript_node(
                chunk_id=chunk_id,
                content=transcript_text,
            )

            print(
                f"[OK] Created chunk {chunk_id} for video {video_id} "
                f"({start_time_int}s - {end_time_int}s)"
            )

            # Create transcript embeddings
            await create_transcript_embeddings(
                chunk_id=chunk_id, content=raw_transcript_json
            )

            # Create frame summary embeddings from in-memory dict
            frame_summary_entries = frame_summary_results.get(chunk_stem)
            if frame_summary_entries:
                raw_frame_summary_json = json.dumps(
                    frame_summary_entries, ensure_ascii=False
                )
                await create_frame_summary_node(
                    chunk_id=chunk_id,
                    content=raw_frame_summary_json,
                )
                await create_frame_summary_embeddings(
                    chunk_id=chunk_id, content=raw_frame_summary_json
                )
            else:
                print(f"[WARN] No frame summary data for chunk: {chunk_stem}")

        # Add to results
        indexed_videos.append(
            {
                "video_id": video_id,
                "path": video_path,
                "filename": item["filename"],
                "num_chunks": chunks_created,
                "indexed": True,
            }
        )

        print(
            f"[OK] Finished indexing video {video_id}: {chunks_created} chunks created"
        )

    return indexed_videos


# TODO: Step 1 - figure out what we wanna do to all local files
# TODO: Step 2 - consider local file impl rn for deployment


def _build_audio_data_from_dir(audio_dir: Path) -> dict[str, bytes]:
    """Build audio_data dict from directory (for local testing)."""
    audio_extensions = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"}
    audio_data: dict[str, bytes] = {}
    for f in sorted(audio_dir.iterdir()):
        if f.is_file() and f.suffix.lower() in audio_extensions:
            audio_data[f.stem] = f.read_bytes()
    return audio_data


def _build_thumbnails_data_from_dir(thumbnails_dir: Path) -> dict[str, list[bytes]]:
    """Build thumbnails_data dict from directory (for local testing)."""
    image_extensions = {".png", ".jpg", ".jpeg", ".webp"}
    thumbnails_data: dict[str, list[bytes]] = {}
    for subdir in sorted(thumbnails_dir.iterdir()):
        if not subdir.is_dir():
            continue
        images = sorted(
            p
            for p in subdir.iterdir()
            if p.is_file() and p.suffix.lower() in image_extensions
        )
        if images:
            thumbnails_data[subdir.name] = [p.read_bytes() for p in images]
    return thumbnails_data


async def test_frame_only():
    print("=== Testing frame summaries only ===")
    backend_dir = Path(__file__).parent.parent
    thumbnails_dir = backend_dir / "videos" / "output_indexer" / "thumbnails"
    if not thumbnails_dir.exists():
        print(f"[WARN] Thumbnails directory not found: {thumbnails_dir}")
        return
    thumbnails_data = _build_thumbnails_data_from_dir(thumbnails_dir)
    if not thumbnails_data:
        print("[WARN] No thumbnails found")
        return
    await generate_frame_summaries(thumbnails_data)


async def test_transcriptions_only():
    print("=== Testing Transcriptions Only ===")
    backend_dir = Path(__file__).parent.parent
    audio_dir = backend_dir / "videos" / "output_indexer" / "audio"
    if not audio_dir.exists():
        print(f"[WARN] Audio directory not found: {audio_dir}")
        return
    audio_data = _build_audio_data_from_dir(audio_dir)
    if not audio_data:
        print("[WARN] No audio files found")
        return
    await generate_transcripts(audio_data)


async def get_all_vids():
    print("====getting all chunks back")
    helix_client = get_helix_client()
    response = helix_client.query("GetAllVideos", {})
    print(response)


async def get_all_chunks():
    print("====getting all chunks back")
    helix_client = get_helix_client()
    response = helix_client.query("GetAllChunks", {})
    print(response)


async def delete_all_videos():
    print("====deleting all chunks====")
    helix_client = get_helix_client()
    response = helix_client.query("DeleteAllVideos", {})
    print(response)


async def delete_all_chunks():
    print("====deleting all chunks====")
    helix_client = get_helix_client()
    response = helix_client.query("DeleteAllChunks", {})
    print(response)


async def delete_out_going_neighbours_for_video():
    print("====deleting all chunks====")
    helix_client = get_helix_client()
    response = helix_client.query("DeleteOutgoingNeighbours", {})
    print(response)


if __name__ == "__main__":
    import sys

    if "--test-transcriptions" in sys.argv or "-t" in sys.argv:
        asyncio.run(test_transcriptions_only())
    elif "--test-frame-summaries" in sys.argv or "-f" in sys.argv:
        asyncio.run(test_frame_only())
    elif "-st" in sys.argv:
        result = asyncio.run(
            search_transcript_embeddings(
                query="give timestamps to all the parts only when amaan talks",
                limit=5,
                video_id="123",
            )
        )
        print(result)
    elif "-sf" in sys.argv:
        result = asyncio.run(
            search_frame_summary_embeddings(
                query="whats the location of the people in the video?",
                limit=5,
                video_id="123",
            )
        )
        print(result)
    # helix helper functions
    elif "-vids" in sys.argv:
        asyncio.run(get_all_vids())
    elif "-ch" in sys.argv:
        asyncio.run(get_all_chunks())
    elif "-dav" in sys.argv:
        asyncio.run(delete_all_videos())
    elif "-dac" in sys.argv:
        asyncio.run(delete_all_chunks())
    elif "-don" in sys.argv:
        asyncio.run(delete_out_going_neighbours_for_video())
    else:
        print("brother, your code dont worky")
