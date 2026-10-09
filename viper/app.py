from __future__ import annotations

from pathlib import Path
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
        self.layout_engine = RelativeLayoutEngine(self.project.canvas_width, self.project.canvas_height)
        self.host: NativeHost | None = None
        self.handlers: dict[str, Any] = {}
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
        return self.replace_project(load_project(path))

    def replace_project(self, project: Project) -> Project:
        self.project = project
        self.layout_engine = RelativeLayoutEngine(self.project.canvas_width, self.project.canvas_height)
        return self.project

    def save(self, path: str | Path) -> Path:
        return save_project(self.project, path)

    def add_component(self, component_type: str, **kwargs: Any) -> Component:
        component = create_component(component_type, **kwargs)
        self.project.components.append(component)
        return component

    def launch(self, host: NativeHost | None = None) -> None:
        self.host = host or create_host()
        self.host.run(DESIGNER_INTERFACE, self.bridge.receive, WindowOptions())

    def __repr__(self) -> str:
        return f"ViperApp(project={self.project.name}, components={len(self.project.components)})"
