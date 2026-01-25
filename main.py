def main():
    print("Hello from the-search-thing!")


def get_file_contents(file_path: str):
    from the_search_thing import get_file_contents  # ty: ignore[unresolved-import]

    contents = get_file_contents(file_path)
    return contents


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: uv run main.py <file_path>")
    else:
        contents = get_file_contents(sys.argv[1])
