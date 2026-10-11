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
    def __init__(self, project: Project, handlers: dict[str, Callable] | None = None, window_id='main'):
        self.project = project
        self.handlers = handlers if handlers is not None else {}
        self.window_id = window_id
        self.form = project.get_window(window_id)
        self._compiled_handlers = {}

    def handler(self, name):
        if name in self.handlers:
            return self.handlers[name]
        source = self.project.event_code.get(name)
        if not source:
            return None
        if name not in self._compiled_handlers:
            namespace = {'__name__': 'viper_project_events'}
            exec(compile(source, f'<event {name}>', 'exec'), namespace)
            handler = namespace.get(name)
            if not callable(handler):
                raise ValueError(f'Event source must define a callable named {name}')
            self._compiled_handlers[name] = handler
        return self._compiled_handlers[name]

    def receive(self, message, reply):
        try:
            if message["command"] == "bootstrap":
                result = {"project": self.form.to_dict()}
            elif message["command"] == "event":
                payload = message["payload"]
                form = self.project.get_window(payload.get('window_id', self.window_id))
                component = next(c for c in form.components if c.id == payload["component_id"])
                name = component.event_handlers.get(payload["event"])
                handler = self.handler(name)
                result = {"handled": bool(handler), "value": handler(payload) if handler else None}
            else:
                raise ValueError("Unknown runtime command")
            reply({"id": message["id"], "result": result})
        except Exception as exc:
            reply({"id": message.get("id"), "error": str(exc)})

    def launch(self, host=None):
        host = host or create_host()
        host.run(RUNTIME_INTERFACE, self.receive, WindowOptions(
            title=self.form.window.title, width=self.form.canvas_width, height=self.form.canvas_height,
            icon_data=self.form.window.icon, resizable=self.form.window.resizable,
            decorated=self.form.window.decorated, min_width=self.form.window.min_width,
            min_height=self.form.window.min_height, state=self.form.window.state,
            background_color=self.form.window.background_color))


def start_project(project: Project, window_id='main') -> subprocess.Popen:
    """Run an unsaved snapshot without depending on the user's working directory."""
    project.get_window(window_id)
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as snapshot:
        path = Path(snapshot.name)
    try:
        save_project(project, path)
        return subprocess.Popen([sys.executable, "-m", "viper.runtime", str(path), "--temporary", '--window', window_id],
                                cwd=Path(__file__).resolve().parent.parent)
    except Exception:
        path.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description="Run a Viper interface")
    parser.add_argument("project", type=Path)
    parser.add_argument("--temporary", action="store_true")
    parser.add_argument('--window', default='main', help='Form ID to open (defaults to the startup form)')
    args = parser.parse_args()
    try:
        project = load_project(args.project)
    finally:
        if args.temporary:
            args.project.unlink(missing_ok=True)
    Runtime(project, window_id=args.window).launch()


if __name__ == "__main__":
    main()
