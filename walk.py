import os


class Walk:
    def __init__(self):
        # defining what file types to ignore
        self.ignore_dirs = {
            ".git",
            "node_modules",
            "__pycache__",
            "venv",
            "dist",
            "build",    
        }
        self.ignore_exts = {".pyc", ".exe", ".dll", ".bin", ".env"}

    def scan_and_index(self, root_dir):
        print(f"Scanning {root_dir}...")

        # Walk the directory
        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in self.ignore_dirs]

            for file in files:
                path = os.path.join(root, file)
                if self._should_ignore(path):
                    continue
                print(path)

        print("Indexing complete.")

    def _should_ignore(self, path):
        _, ext = os.path.splitext(path)
        return ext.lower() in self.ignore_exts


if __name__ == "__main__":
    walker = Walk()
    walker.scan_and_index("C:\\Users\\amaan\\OneDrive\\Documents\\coding")
