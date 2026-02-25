import argparse
import os

from backend.app import app


def _has_route(path: str, method: str) -> bool:
    for route in app.routes:
        if getattr(route, "path", None) == path and method in getattr(
            route, "methods", set()
        ):
            return True
    return False


def _ensure_health_route() -> None:
    if _has_route("/health", "GET"):
        return

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}


def _parse_port(default_port: int) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--port", type=int)
    args, _ = parser.parse_known_args()

    env_port = os.getenv("PORT")
    if args.port is not None:
        return args.port
    if env_port and env_port.isdigit():
        return int(env_port)
    return default_port


def _parse_host(default_host: str) -> str:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--host", type=str)
    args, _ = parser.parse_known_args()

    env_host = os.getenv("HOST")
    if args.host:
        return args.host
    if env_host:
        return env_host
    return default_host


def main() -> None:
    _ensure_health_route()
    port = _parse_port(49000)
    if port <= 0 or port > 65535:
        port = 49000
    host = _parse_host("127.0.0.1")

    import uvicorn

    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
