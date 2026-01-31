import sys

from the_search_thing import walk_and_get_files  # ty:ignore[unresolved-import]

if __name__ == "__main__":
    dir_path = sys.argv[1]
    paths = walk_and_get_files(dir_path)
    if paths is None:
        paths = []
        print(
            "Got None - rebuild the Rust extension: uv run maturin develop", flush=True
        )
    for p in paths:
        print(p, flush=True)
    if paths:
        print(f"\n({len(paths)} paths)", flush=True)
