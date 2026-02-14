import asyncio
import base64
import json
import uuid
from pathlib import Path
from typing import List

from utils.clients import get_groq_client, get_helix_client


def _bytes_to_data_uri(image_bytes: bytes, mime_hint: str = "jpeg") -> str:
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:image/{mime_hint};base64,{encoded}"


def _mime_hint_from_path(path: Path) -> str:
    suffix = path.suffix.lower()
    mapping = {
        ".jpg": "jpeg",
        ".jpeg": "jpeg",
        ".png": "png",
        ".webp": "webp",
        ".gif": "gif",
        ".bmp": "bmp",
        ".tiff": "tiff",
    }
    return mapping.get(suffix, "jpeg")


async def img_indexer(
    file_paths: List[str] | str,
) -> List[dict]:
    if isinstance(file_paths, str):
        file_paths = [file_paths]
    if not file_paths:
        print("No file paths provided. exiting image indexing.")
        return []

    results: List[dict] = []
    for path in file_paths:
        p = Path(path)
        if not p.exists():
            print(f"[WARN] Skipping (not found): {path}")
            results.append(
                {
                    "path": path,
                    "image_id": None,
                    "indexed": False,
                    "error": "Path not found",
                }
            )
            continue

        try:
            image_bytes = p.read_bytes()
            mime_hint = _mime_hint_from_path(p)
            data_uri = _bytes_to_data_uri(image_bytes, mime_hint)
        except Exception as e:
            print(f"[WARN] Skipping (Bytes Extraction failed): {path} — {e}")
            results.append(
                {"path": path, "image_id": None, "indexed": False, "error": str(e)}
            )
            continue

        try:
            summary_payload, embedding_text = await generate_summary(data_uri)
            print(f"Summary payload: {summary_payload}")
            print(f"Embedding Text: {embedding_text}")
        except Exception as e:
            print(f"[WARN] Skipping (Summary failed): {path} — {e}")
            results.append(
                {"path": path, "image_id": None, "indexed": False, "error": str(e)}
            )
            continue

        image_id = uuid.uuid4().hex
        try:
            await create_img(image_id, json.dumps(summary_payload), path=path)
            await create_img_embeddings(image_id, embedding_text, path=path)
            results.append({"path": path, "image_id": image_id, "indexed": True})
            print(f"[OK] Indexed image: {path}")
        except Exception as e:
            print(f"[ERROR] Indexing failed for {path}: {e}")
            results.append(
                {"path": path, "image_id": image_id, "indexed": False, "error": str(e)}
            )

    return results


# creating image node
async def create_img(image_id: str, content: str, path: str) -> str:
    # here content is a raw summary
    image_params = {"image_id": image_id, "content": content, "path": path}

    def _query() -> str:
        helix_client = get_helix_client()
        response = helix_client.query("CreateImage", image_params)
        print(f"[HELIX] CreateImage response for {path}: {response}")
        return json.dumps(response)

    return await asyncio.to_thread(_query)


# creating img vector nodes
async def create_img_embeddings(image_id: str, content: str, path: str) -> str:
    image_params = {"image_id": image_id, "content": content, "path": path}

    def _query() -> str:
        helix_client = get_helix_client()
        response = helix_client.query(
            "CreateImageEmbeddings",
            image_params,
        )
        print(f"[HELIX] CreateImageEmbeddings response for {path}: {response}")
        return json.dumps(response)

    return await asyncio.to_thread(_query)


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
    ocr = parsed_obj.get("ocr") if isinstance(parsed_obj.get("ocr"), str) else ""
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
        "ocr": ocr,
        "quality": quality,
    }


def _build_embedding_text(summary: dict) -> str:
    parts: list[str] = []

    def add(label: str, value: object) -> None:
        if value is None:
            return
        if isinstance(value, list):
            value = ", ".join([str(v) for v in value if v])
        if isinstance(value, str):
            value = value.strip()
        if value:
            parts.append(f"{label}: {value}")

    add("summary", summary.get("summary"))
    add("objects", summary.get("objects"))
    add("actions", summary.get("actions"))
    add("setting", summary.get("setting"))
    add("ocr", summary.get("ocr"))
    add("quality", summary.get("quality"))

    return " | ".join(parts)


async def generate_summary(
    image_data_uri: str,
) -> tuple[dict, str]:
    """
    Summarize a single image (data URI) and return both:
    - structured JSON payload
    - normalized text string for embeddings
    """
    if not image_data_uri:
        print("[WARN] No bytes data provided")
        return {}, ""

    client = get_groq_client()
    prompt = (
        "You are an expert vision assistant. Provide a concise JSON summary for "
        "the provided image. Respond with JSON only (no code fences). Use the schema: "
        '{"summary": "<1-2 sentences>", "objects": ["..."], "actions": ["..."], '
        '"setting": "<location or scene>", "ocr": "<visible text or empty>", "quality": "<good|low>"}'
    )

    response = client.chat.completions.create(
        model="meta-llama/llama-4-maverick-17b-128e-instruct",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_data_uri}},
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
    embedding_text = _build_embedding_text(summary_payload)

    return summary_payload, embedding_text


if __name__ == "__main__":
    results = asyncio.run(img_indexer("C:\\Users\\amaan\\Downloads\\testing\\woody.jpg"))
    import json
    print(json.dumps(results, indent=2))
