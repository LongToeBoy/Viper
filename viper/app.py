from __future__ import annotations

from pathlib import Path
from copy import deepcopy
from typing import Any

from .bridge import Bridge
from .component_registry import create_component
from .layout import RelativeLayoutEngine
from .models import Component, Project
from .serializer import load_project, save_project
from .hosts import NativeHost, WindowOptions, create_host
from .designer import DESIGNER_INTERFACE


class ViperApp:
    """Primary application state and project controller for Viper."""

    def __init__(self, project: Project | None = None) -> None:
        self.project = project or self.create_demo_project()
        self.layout_engine = RelativeLayoutEngine(self.project.canvas_width if self.project.windows else 960,
                                                  self.project.canvas_height if self.project.windows else 640)
        self.host: NativeHost | None = None
        self.handlers: dict[str, Any] = {}
        self.project_path: Path | None = None
        self._document_id = 0
        self._saved_project = self._document_snapshot(self.project)
        self._last_title = None
        self.bridge = Bridge(self)

    @staticmethod
    def create_demo_project() -> Project:
        project = Project(name="Demo Project", description="Starter demo layout")
        project.components = [
            create_component("button", name="Launch", text="Launch", layout={"x": 18, "y": 18, "width": 22, "height": 12}),
            create_component("label", name="StatusLabel", text="Ready", layout={"x": 18, "y": 42, "width": 30, "height": 8}),
            create_component("text_input", name="NameInput", text="Alice", layout={"x": 18, "y": 58, "width": 28, "height": 10}),
            create_component("panel", name="MainPanel", text="Dashboard", layout={"x": 55, "y": 18, "width": 28, "height": 46}),
        ]
        return project

    def load(self, path: str | Path) -> Project:
        path = Path(path).resolve()
        project = load_project(path)
        return self.replace_project(project, reset_document=True, path=path)

    def replace_project(self, project: Project, *, reset_document=False, path=None) -> Project:
        self.project = project
        self.layout_engine = RelativeLayoutEngine(self.project.canvas_width if self.project.windows else 960,
                                                  self.project.canvas_height if self.project.windows else 640)
        if reset_document:
            self._document_id += 1
            self.project_path = Path(path).resolve() if path is not None else None
            self._saved_project = self._document_snapshot(project)
        self.refresh_title()
        return self.project

    @staticmethod
    def _document_snapshot(project: Project):
        snapshot = deepcopy(project.to_dict())
        # Treat legacy rectangle initialization as a representation change, not
        # an edit. Reuse the existing migration geometry; never solve in Python.
        for window in snapshot['windows']:
            layout = RelativeLayoutEngine(window['canvas_width'], window['canvas_height'])
            for source, component in zip(project.get_window(window['form_id']).components, window['components']):
                if not component['box']:
                    component['box'] = {**layout.compute_component_bounds(source),
                                        'reference_width': window['canvas_width'], 'reference_height': window['canvas_height']}
                # Python and JavaScript differ in the last floating-point bits
                # of percentage conversion. Subpixel roundoff is not an edit.
                component['box'] = {key: round(value, 9) for key, value in component['box'].items()}
        return snapshot

    @property
    def dirty(self):
        return self._document_snapshot(self.project) != self._saved_project

    def document_state(self):
        dirty = self.dirty
        filename = f' [{self.project_path.name}]' if self.project_path else ''
        return {'path': str(self.project_path) if self.project_path else None, 'dirty': dirty,
                'title': f'{self.project.name}{filename}{" *" if dirty else ""} — Viper Designer'}

    def refresh_title(self):
        title = self.document_state()['title']
        if self.host is not None and title != self._last_title:
            setter = getattr(self.host, 'set_title', None)
            if setter:
                setter(title)
                self._last_title = title

    def save(self, path: str | Path | None = None, *, snapshot=None, document_id=None) -> Path:
        target = Path(path).resolve() if path is not None else self.project_path
        if target is None:
            raise ValueError('Choose a project filename for the first save.')
        snapshot = snapshot if snapshot is not None else self.project
        saved = save_project(snapshot, target)
        # A native dialog can outlive edits or even a project replacement. Only
        # the document it belongs to may acquire its path and saved checkpoint.
        if document_id is None or document_id == self._document_id:
            self.project_path = saved.resolve()
            self._saved_project = self._document_snapshot(snapshot)
            self.refresh_title()
        return saved

    def add_component(self, component_type: str, *, window_id=None, **kwargs: Any) -> Component:
        component = create_component(component_type, **kwargs)
        self.project.get_window(window_id).components.append(component)
        self.refresh_title()
        return component

    def launch(self, host: NativeHost | None = None) -> None:
        self.host = host or create_host()
        self._last_title = self.document_state()['title']
        self.host.run(DESIGNER_INTERFACE, self.bridge.receive, WindowOptions(title=self._last_title))

    def __repr__(self) -> str:
        return f"ViperApp(project={self.project.name}, components={sum(len(form.components) for form in self.project.windows)})"
