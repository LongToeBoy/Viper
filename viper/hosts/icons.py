"""Materialize the portable project icon for a native adapter."""
import base64
import struct
from pathlib import Path


def write_icon(data_url: str, directory: Path, *, ico: bool) -> Path:
    png = base64.b64decode(data_url.removeprefix("data:image/png;base64,"), validate=True)
    if len(png) > 1024 * 1024 or png[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError("Invalid or oversized window icon")
    width, height = struct.unpack('>II', png[16:24])
    if (width, height) != (32, 32):
        raise ValueError("Window icon must be 32 by 32 pixels")
    path = directory / ("viper-app.ico" if ico else "viper-app.png")
    if ico:
        # Modern Windows accepts a PNG payload in an ICO directory entry.
        png = struct.pack('<HHH', 0, 1, 1) + struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(png), 22) + png
    path.write_bytes(png)
    return path
