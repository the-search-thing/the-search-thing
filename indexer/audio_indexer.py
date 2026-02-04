from the_search_thing import detect_tempo  # ty: ignore[unresolved-import]


def detect_tempo_in_rust(audio_path: str) -> float:
    return detect_tempo(audio_path)


if __name__ == "__main__":
    import sys

    audio_path = sys.argv[1]
    tempo = detect_tempo_in_rust(audio_path)
    print(f"Tempo: {tempo} BPM")
