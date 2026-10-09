from __future__ import annotations

# Shared interface locations. Native window behavior lives in hosts/.

from pathlib import Path

ASSET_DIR = Path(__file__).resolve().parent / "assets"
DESIGNER_INTERFACE = ASSET_DIR / "designer.html"
RUNTIME_INTERFACE = ASSET_DIR / "runtime.html"
