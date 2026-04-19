from __future__ import annotations

import http.server
import socketserver
import subprocess
import sys
from pathlib import Path


PORT = 8000
ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / "dist"


class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
        ".wasm": "application/wasm",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)


def ensure_dist() -> None:
    if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
      return

    print("No dist build found. Running npm run build...", flush=True)
    result = subprocess.run(["npm", "run", "build"], cwd=ROOT)
    if result.returncode != 0:
        sys.exit(result.returncode)


def main() -> None:
    ensure_dist()

    with socketserver.TCPServer(("", PORT), PreviewHandler) as httpd:
        print(f"Serving dist preview at http://localhost:{PORT}", flush=True)
        print("Use `npm run dev` if you want Vite hot-reload for /src/main.ts.", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
