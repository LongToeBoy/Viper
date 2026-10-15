from __future__ import annotations

import json
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
    target.write_text(json.dumps(serialized, indent=2), encoding="utf-8")
    return target


def load_project(path: str | Path) -> Project:
    target = Path(path)
    payload = json.loads(target.read_text(encoding="utf-8"))
    return deserialize_project(payload)
