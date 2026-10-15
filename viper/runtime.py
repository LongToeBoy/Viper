"""Shared application runtime, used by Run and portable Python launchers."""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
import copy
import json
from pathlib import Path
from typing import Callable

from .designer import RUNTIME_INTERFACE
from .hosts import create_host, WindowOptions
from .models import Project
from .serializer import load_project, save_project
from .control_api import ControlState, Event, FormContext


class Runtime:
    def __init__(self, project: Project, handlers: dict[str, Callable] | None = None, window_id=None):
        self.project = project
        self.handlers = handlers if handlers is not None else {}
        self.form = project.get_window(window_id)
        self.window_id = self.form.form_id
        self._compiled_handlers = {}
        self._control_state = ControlState()

    def handler(self, name, form=None):
        if name in self.handlers:
            return self.handlers[name]
        source = self.project.event_code.get(name)
        if not source:
            return None
        form = form or self.form
        key = (form.form_id, name)
        if key not in self._compiled_handlers:
            controls = self._control_state.controls(form)
            namespace = {'__name__': 'viper_project_events', 'controls': controls,
                         'form': FormContext(form.form_id, form.window.name, controls), **controls.bindings(name)}
            exec(compile(source, f'<event {name}>', 'exec'), namespace)
            handler = namespace.get(name)
            if not callable(handler):
                raise ValueError(f'Event source must define a callable named {name}')
            self._compiled_handlers[key] = handler
        return self._compiled_handlers[key]

    def receive(self, message, reply):
        before = None
        try:
            if message["command"] == "bootstrap":
                result = {"project": self.form.to_dict()}
            elif message["command"] == "event":
                payload = message["payload"]
                form = self.project.get_window(payload.get('window_id', self.window_id))
                component = next((c for c in form.components if c.id == payload["component_id"]), None)
                if component is None:
                    raise ValueError(f'Unknown component in window {form.form_id}: {payload["component_id"]}')
                name = component.event_handlers.get(payload["event"])
                self._control_state.ingest(form, payload)
                values = self._control_state.values[form.form_id]
                before = copy.deepcopy(values)
                handler = self.handler(name, form)
                event = Event(payload, form, self._control_state.controls(form), component.id)
                result = {"handled": bool(handler), "value": handler(event) if handler else None}
                updates = self._control_state.updates(form, before)
                if updates:
                    result['updates'] = updates
                json.dumps(result, allow_nan=False)
            else:
                raise ValueError("Unknown runtime command")
            reply({"id": message["id"], "result": result})
        except Exception as exc:
            if before is not None:
                # Retain the same dictionaries referenced by cached control objects.
                values.clear(); values.update(before)
            reply({"id": message.get("id"), "error": str(exc)})

    def launch(self, host=None):
        host = host or create_host()
        host.run(RUNTIME_INTERFACE, self.receive, WindowOptions(
            title=self.form.window.title, width=self.form.canvas_width, height=self.form.canvas_height,
            icon_data=self.form.window.icon, resizable=self.form.window.resizable,
            decorated=self.form.window.decorated, min_width=self.form.window.min_width,
            min_height=self.form.window.min_height, state=self.form.window.state,
            background_color=self.form.window.background_color))


def start_project(project: Project, window_id=None) -> subprocess.Popen:
    """Run an unsaved snapshot without depending on the user's working directory."""
    window_id = project.get_window(window_id).form_id
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
    parser.add_argument('--window', help='Form ID to open (defaults to the startup form)')
    args = parser.parse_args()
    try:
        project = load_project(args.project)
    finally:
        if args.temporary:
            args.project.unlink(missing_ok=True)
    Runtime(project, window_id=args.window).launch()


if __name__ == "__main__":
    main()
