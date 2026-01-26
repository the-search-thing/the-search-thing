def main():
    print("Hello from the-search-thing!")


def add_function(x: int, y: int) -> int:
    from the_search_thing import add_numbers  # ty:ignore[unresolved-import]

    result = add_numbers(x, y)
    print(result)
    return result
    
def walk_dir(dir: str):
    from the_search_thing import walk # ty:ignore[unresolved-import]
    
    walk("C:/Users/karth/Downloads")


if __name__ == "__main__":
    add_function(12, 13)
