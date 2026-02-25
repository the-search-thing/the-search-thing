import os
import threading

from dotenv import load_dotenv
from groq import Groq
from helix.client import Client as Helix_Client

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
                helix_is_local = os.getenv("HELIX_LOCAL", "true").lower() == "true"
                helix_port = int(os.getenv("HELIX_PORT", "7003"))
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
