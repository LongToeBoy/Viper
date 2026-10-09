"""Shared application runtime, used by Run and portable Python launchers."""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

from .designer import RUNTIME_INTERFACE
from .hosts import create_host, WindowOptions
from .models import Project
from .serializer import load_project, save_project


class Runtime:
    def __init__(self, project: Project, handlers: dict[str, Callable] | None = None):
        self.project = project
        self.handlers = handlers or {}

    def receive(self, message, reply):
        try:
            if message["command"] == "bootstrap":
                result = {"project": self.project.to_dict()}
            elif message["command"] == "event":
                payload = message["payload"]
                component = next(c for c in self.project.components if c.id == payload["component_id"])
                name = component.event_handlers.get(payload["event"])
                handler = self.handlers.get(name)
                result = {"handled": bool(handler), "value": handler(payload) if handler else None}
            else:
                raise ValueError("Unknown runtime command")
            reply({"id": message["id"], "result": result})
        except Exception as exc:
            reply({"id": message.get("id"), "error": str(exc)})

    def launch(self, host=None):
        host = host or create_host()
        host.run(RUNTIME_INTERFACE, self.receive, WindowOptions(
            title=self.project.window.title, width=self.project.canvas_width, height=self.project.canvas_height,
            icon_data=self.project.window.icon, resizable=self.project.window.resizable,
            decorated=self.project.window.decorated, min_width=self.project.window.min_width,
            min_height=self.project.window.min_height, state=self.project.window.state,
            background_color=self.project.window.background_color))


def start_project(project: Project) -> subprocess.Popen:
    """Run an unsaved snapshot without depending on the user's working directory."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as snapshot:
        path = Path(snapshot.name)
    try:
        save_project(project, path)
        return subprocess.Popen([sys.executable, "-m", "viper.runtime", str(path), "--temporary"],
                                cwd=Path(__file__).resolve().parent.parent)
    except Exception:
        path.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description="Run a Viper interface")
    parser.add_argument("project", type=Path)
    parser.add_argument("--temporary", action="store_true")
    args = parser.parse_args()
    try:
        project = load_project(args.project)
    finally:
        if args.temporary:
            args.project.unlink(missing_ok=True)
    Runtime(project).launch()


if __name__ == "__main__":
    main()
