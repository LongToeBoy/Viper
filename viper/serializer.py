from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from .models import Project


def serialize_project(project: Project) -> dict[str, Any]:
    return {
        "schema_version": 2,
        "project": project.to_dict(),
    }


def deserialize_project(payload: dict[str, Any]) -> Project:
    if not isinstance(payload, dict):
        raise ValueError("Project JSON must be an object")
    if payload.get("schema_version", 1) not in (1, 2):
        raise ValueError("Unsupported project schema version")
    project_data = payload.get("project", payload)
    return Project.from_dict(project_data)


def save_project(project: Project, path: str | Path) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    serialized = serialize_project(project)
    # Promote a complete sibling file so a failed save retains the last copy.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent,
                                         prefix='.viper-save-', suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(json.dumps(serialized, indent=2))
        temporary.replace(target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return target


def load_project(path: str | Path) -> Project:
    target = Path(path)
    payload = json.loads(target.read_text(encoding="utf-8"))
    return deserialize_project(payload)
