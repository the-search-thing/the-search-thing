import threading
import time
from typing import Any

# NOTE: This is intentionally in-memory only. It resets on server restart.
# We keep it isolated so it can be swapped for a persistent store later.

_job_store_lock = threading.Lock()
_job_store: dict[str, dict[str, Any]] = {}


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def create_job(job_id: str, dir_path: str, batch_size: int) -> dict[str, Any]:
    record = {
        "job_id": job_id,
        "dir": dir_path,
        "status": "running",
        "phase": "scan_text",
        "batch_size": batch_size,
        "text_found": 0,
        "text_indexed": 0,
        "text_errors": 0,
        "text_skipped": 0,
        "video_found": 0,
        "video_indexed": 0,
        "video_errors": 0,
        "video_skipped": 0,
        "image_found": 0,
        "image_indexed": 0,
        "image_errors": 0,
        "image_skipped": 0,
        "message": "",
        "error": "",
        "started_at": _now_iso(),
        "updated_at": _now_iso(),
        "finished_at": None,
    }
    with _job_store_lock:
        _job_store[job_id] = record
    return record


def update_job(job_id: str, **fields: Any) -> dict[str, Any] | None:
    with _job_store_lock:
        record = _job_store.get(job_id)
        if record is None:
            return None
        record.update(fields)
        record["updated_at"] = _now_iso()
        return dict(record)


def finish_job(job_id: str, status: str = "completed", message: str = "") -> None:
    update_job(
        job_id,
        status=status,
        phase="done",
        message=message,
        finished_at=_now_iso(),
    )


def fail_job(job_id: str, error: str) -> None:
    update_job(
        job_id,
        status="failed",
        phase="done",
        error=error,
        finished_at=_now_iso(),
    )


def get_job(job_id: str) -> dict[str, Any] | None:
    with _job_store_lock:
        record = _job_store.get(job_id)
        return dict(record) if record is not None else None
