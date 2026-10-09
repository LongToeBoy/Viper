from __future__ import annotations

# Optional asset-development helper; native IDE and runtime launch do not use it.

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ASSET_DIR = Path(__file__).resolve().parent / "assets"


class ViperRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory or str(ASSET_DIR), **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        print(f"[Viper] {self.address_string()} - {format % args}")


def start_web_server(host: str = "127.0.0.1", port: int = 8765) -> None:
    handler = partial(ViperRequestHandler, directory=str(ASSET_DIR))
    server = ThreadingHTTPServer((host, port), handler)
    print(f"Viper is serving the editor at http://{host}:{port}/designer.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nViper server stopped.")
    finally:
        server.server_close()
