from the_search_thing import search_images


def search_images(image_path: str) -> str:
    return search_images(image_path)


if __name__ == "__main__":
    import sys

    img_path = sys.argv[1]
    path = search_images(img_path)
    print(f"Img Path: {path}")
