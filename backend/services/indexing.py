import asyncio
import json
import logging
import os
import uuid
from pathlib import Path

from backend.utils.content_hash import compute_file_hash

logger = logging.getLogger(__name__)

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"


def _load_extension_to_category() -> dict[str, str]:
    """Load file_types.json; returns mapping ext -> category e.g. {'.mp4': 'video'}.
    Expects extensions to be lowercase with a leading '.'."""
    path = CONFIG_DIR / "file_types.json"
    try:
        with path.open(encoding="utf-8") as f:
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


def _get_text_extensions(ext_to_category: dict[str, str]) -> list[str]:
    return [ext for ext, category in ext_to_category.items() if category == "text"]


def _get_video_extensions(ext_to_category: dict[str, str]) -> list[str]:
    return [ext for ext, category in ext_to_category.items() if category == "video"]


def _get_img_extensions(ext_to_category: dict[str, str]) -> list[str]:
    return [ext for ext, category in ext_to_category.items() if category == "image"]


def _collect_files_by_extension(root: str, extensions: list[str]) -> list[str]:
    ext_set = {ext.lower() for ext in extensions}
    if os.path.isfile(root):
        ext = os.path.splitext(root)[1].lower()
        return [root] if ext in ext_set else []

    matches: list[str] = []
    for current_root, _, files in os.walk(root):
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext in ext_set:
                matches.append(os.path.join(current_root, name))
    return matches


def _collect_files_by_extension_with_ignore(
    root: str,
    extensions: list[str],
    ignore_exts: set[str],
    ignore_files: set[str],
) -> list[str]:
    ext_set = {ext.lower() for ext in extensions}
    ignore_ext_set = {ext.lower() for ext in ignore_exts}
    ignore_file_set = {name.lower() for name in ignore_files}

    if os.path.isfile(root):
        base_name = os.path.basename(root).lower()
        if base_name in ignore_file_set:
            return []
        ext = os.path.splitext(root)[1].lower()
        if ext in ignore_ext_set:
            return []
        return [root] if ext in ext_set else []

    matches: list[str] = []
    for current_root, _, files in os.walk(root):
        for name in files:
            base_name = name.lower()
            if base_name in ignore_file_set:
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext in ignore_ext_set:
                continue
            if ext in ext_set:
                matches.append(os.path.join(current_root, name))
    return matches


def _normalize_extension(ext: str) -> str:
    ext = ext.strip().lower()
    if not ext:
        return ext
    return ext if ext.startswith(".") else f".{ext}"


def _load_ignore_config() -> tuple[set[str], set[str]]:
    path = CONFIG_DIR / "ignore.json"

    try:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning("Could not load ignore.json: %s", e)
        return set(), set()

    ignore_exts_raw = []
    ignore_files_raw = []
    if isinstance(data, dict):
        ignore_exts_raw = data.get("ignore_extensions", [])
        ignore_files_raw = data.get("ignore_files", [])
        if not ignore_exts_raw and "ignore" in data:
            ignore_exts_raw = data.get("ignore", [])

    ignore_exts = {
        _normalize_extension(ext)
        for ext in ignore_exts_raw
        if isinstance(ext, str) and _normalize_extension(ext)
    }
    ignore_files = {
        name.strip().lower()
        for name in ignore_files_raw
        if isinstance(name, str) and name.strip()
    }

    return ignore_exts, ignore_files


async def index_single_file(path: str, content: str, job_id: str) -> bool:
    from backend.indexer.file_indexer import (
        create_file,
        create_file_embeddings,
        get_file_by_hash,
    )

    try:
        content_hash = compute_file_hash(path)
    except Exception as e:
        logger.error("[job:%s] [ERROR] Hash failed: %s - %s", job_id, path, e)
        return False

    try:
        existing = await get_file_by_hash(content_hash)
    except Exception as e:
        logger.error("[job:%s] [ERROR] Hash lookup failed: %s - %s", job_id, path, e)
        existing = None

    if existing:
        logger.info("[job:%s] [SKIP] Already indexed: %s", job_id, path)
        return True

    file_id = str(uuid.uuid4())
    try:
        await create_file(file_id, content_hash, content, path=path)
        await create_file_embeddings(file_id, content, path=path)
        logger.info("[job:%s] [OK] Indexed: %s", job_id, path)
        return True
    except Exception as e:
        logger.error("[job:%s] [ERROR] Failed: %s - %s", job_id, path, e)
        return False


async def _process_batch(batch: list[tuple[str, str]], job_id: str) -> dict[str, int]:
    tasks = [
        asyncio.create_task(index_single_file(path, content, job_id))
        for path, content in batch
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    indexed = 0
    errors = 0
    for result in results:
        if isinstance(result, Exception):
            errors += 1
            logger.error("[job:%s] [ERROR] Batch task exception: %s", job_id, result)
        elif result:
            indexed += 1
        else:
            errors += 1

    return {"indexed": indexed, "errors": errors}


async def run_indexing_job(dir: str, job_id: str, batch_size: int = 10) -> None:
    from the_search_thing import (
        walk_and_get_text_file_batch,  # ty: ignore[unresolved-import]
    )

    ext_to_category = _load_extension_to_category()
    text_exts = _get_text_extensions(ext_to_category)
    video_exts = _get_video_extensions(ext_to_category)
    img_exts = _get_img_extensions(ext_to_category)

    ignore_exts, ignore_files = _load_ignore_config()
    ignore_exts_sorted = sorted(ignore_exts)
    ignore_files_sorted = sorted(ignore_files)
    cursor = 0
    total_found = 0
    text_indexed = 0
    non_text_skipped = 0
    errors = 0
    video_found = 0
    video_indexed = 0
    video_errors = 0
    video_skipped = 0
    image_found = 0
    image_indexed = 0
    image_errors = 0
    image_skipped = 0

    logger.info("[job:%s] Started indexing job for: %s", job_id, dir)

    supports_ignore = True

    while True:
        try:
            if supports_ignore:
                try:
                    (
                        batch,
                        cursor,
                        done,
                        scanned_count,
                        skipped_count,
                    ) = await asyncio.to_thread(
                        walk_and_get_text_file_batch,
                        dir,
                        text_exts,
                        ignore_exts_sorted,
                        ignore_files_sorted,
                        cursor,
                        batch_size,
                    )
                except TypeError as e:
                    # Only fall back for the legacy arity mismatch case.
                    # Do not swallow real TypeErrors raised by the walk implementation.
                    msg = str(e)
                    arity_mismatch = (
                        "positional argument" in msg
                        and "takes" in msg
                        and "given" in msg
                        and "but" in msg
                    )
                    if not arity_mismatch:
                        raise

                    supports_ignore = False
                    (
                        batch,
                        cursor,
                        done,
                        scanned_count,
                        skipped_count,
                    ) = await asyncio.to_thread(
                        walk_and_get_text_file_batch,
                        dir,
                        text_exts,
                        cursor,
                        batch_size,
                    )
            else:
                (
                    batch,
                    cursor,
                    done,
                    scanned_count,
                    skipped_count,
                ) = await asyncio.to_thread(
                    walk_and_get_text_file_batch,
                    dir,
                    text_exts,
                    cursor,
                    batch_size,
                )
        except Exception as e:
            logger.exception("[job:%s] Walk failed: %s", job_id, e)
            errors += 1
            break

        total_found += scanned_count
        non_text_skipped += skipped_count

        if batch:
            batch_results = await _process_batch(batch, job_id)
            text_indexed += batch_results["indexed"]
            errors += batch_results["errors"]

        if done:
            break

    if video_exts:
        video_files = await asyncio.to_thread(
            _collect_files_by_extension_with_ignore,
            dir,
            video_exts,
            ignore_exts,
            ignore_files,
        )
        video_found = len(video_files)
        if video_files:
            from backend.indexer.indexer import get_video_by_hash, indexer_function

            for video_path in video_files:
                try:
                    content_hash = compute_file_hash(video_path)
                except Exception as e:
                    video_errors += 1
                    logger.error(
                        "[job:%s] [ERROR] Video hash failed: %s - %s",
                        job_id,
                        video_path,
                        e,
                    )
                    continue

                try:
                    existing = await get_video_by_hash(content_hash)
                except Exception as e:
                    logger.error(
                        "[job:%s] [ERROR] Video hash lookup failed: %s - %s",
                        job_id,
                        video_path,
                        e,
                    )
                    existing = None

                if existing:
                    video_skipped += 1
                    logger.info(
                        "[job:%s] [SKIP] Video already indexed: %s",
                        job_id,
                        video_path,
                    )
                    continue

                video_id = uuid.uuid4().hex
                try:
                    results = await indexer_function(
                        video_id, content_hash, video_path
                    )
                    if results:
                        video_indexed += sum(
                            1 for result in results if result.get("indexed")
                        )
                        video_errors += sum(
                            1 for result in results if not result.get("indexed")
                        )
                    else:
                        video_errors += 1
                except Exception as e:
                    video_errors += 1
                    logger.error(
                        "[job:%s] [ERROR] Video indexing failed: %s - %s",
                        job_id,
                        video_path,
                        e,
                    )

    if img_exts:
        image_files = await asyncio.to_thread(
            _collect_files_by_extension, dir, img_exts
        )
        image_found = len(image_files)
        if image_files:
            from backend.indexer.image_indexer import img_indexer

            try:
                results = await img_indexer(image_files)
                if results:
                    image_indexed += sum(
                        1 for result in results if result.get("indexed")
                    )
                    image_skipped += sum(
                        1
                        for result in results
                        if not result.get("indexed")
                        and result.get("error") == "Duplicate content hash"
                    )
                    image_errors += sum(
                        1
                        for result in results
                        if not result.get("indexed")
                        and result.get("error") != "Duplicate content hash"
                    )
                else:
                    image_errors += 1
            except Exception as e:
                image_errors += 1
                logger.error(
                    "[job:%s] [ERROR] Image indexing failed: %s",
                    job_id,
                    e,
                )

    logger.info(
        "[job:%s] [SUMMARY] Job completed for %s - Found: %d, Indexed: %d, Skipped: %d, Errors: %d",
        job_id,
        dir,
        total_found,
        text_indexed,
        non_text_skipped,
        errors,
    )
    logger.info(
        "[job:%s] [VIDEO SUMMARY] Found: %d, Indexed: %d, Skipped: %d, Errors: %d",
        job_id,
        video_found,
        video_indexed,
        video_skipped,
        video_errors,
    )

    logger.info(
        "[job:%s] [IMAGE SUMMARY] Found: %d, Indexed: %d, Skipped: %d, Errors: %d",
        job_id,
        image_found,
        image_indexed,
        image_skipped,
        image_errors,
    )
