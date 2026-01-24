def main():
    print("Hello from the-search-thing!")


def get_file_contents(file_path: str):
    from the_search_thing import get_file_contents

    contents = get_file_contents(file_path)
    return contents


if __name__ == "__main__":
    get_file_contents(
        "C:\\Users\\amaan\\OneDrive\\Documents\\coding\\the-search-thing\\pyproject.toml"
    )
