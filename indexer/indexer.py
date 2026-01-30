import asyncio
import base64
import json
import os
import sys
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Literal

from dotenv import load_dotenv
from google import genai
from google.genai import types
from groq import Groq
from helix.client import Client as Helix_Client
from search_engine_api import rust_indexer  # ty:ignore[unresolved-import]

load_dotenv()


_groq_client: Groq | None = None
_groq_lock = threading.Lock()
_helix_client: Helix_Client | None = None
_helix_client_lock = threading.Lock()


def get_helix_client() -> Helix_Client:
    """get or create Helix client instance (thread-safe)"""
    global _helix_client
    if _helix_client is None:
        with _helix_client_lock:
            if _helix_client is None:
                # FIXME: this shouldnt be hardcoded
                # helix_is_local = os.getenv("HELIX_LOCAL")
                helix_is_local = True
                # helix_port = os.getenv("HELIX_PORT")
                helix_port = 7002
                # FIXME: local is hardcoded for now need to change this later
                # TODO: change to use local from env
                _helix_client = Helix_Client(local=helix_is_local, port=helix_port)
    if _helix_client is None:
        raise RuntimeError("Failed to init HELIX client")
    return _helix_client


def get_groq_client() -> Groq:
    """Get or create Groq client instance (thread-safe)."""
    global _groq_client
    if _groq_client is None:
        with _groq_lock:
            if _groq_client is None:
                api_key = os.getenv("GROQ_API_KEY")
                if not api_key:
                    raise ValueError("GROQ_API_KEY not found in environment variables")
                _groq_client = Groq(api_key=api_key)
    if _groq_client is None:
        raise RuntimeError("Failed to init GROQ client")
    return _groq_client


def transcribe_audio_file_groq(audio_path: Path) -> dict:
    pass


async def generate_transcripts():
    pass


async def generate_frame_summaries():
    pass
