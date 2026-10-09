from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import math


def finite_number(value, name, minimum=None, maximum=None):
    number = float(value)
    if not math.isfinite(number) or (minimum is not None and number < minimum) or (maximum is not None and number > maximum):
        raise ValueError(f"Invalid {name}")
    return number


def rectangle_definition(data):
    if data is None:
        return None
    return {key: finite_number(data.get(key, default), key, minimum) for key, default, minimum in
            [('x', 0, None), ('y', 0, None), ('width', 80, 1), ('height', 32, 1),
             ('reference_width', 960, 1), ('reference_height', 640, 1)]}


def link_definition(data):
    axis = data.get('axis', 'both')
    if axis not in {'both', 'x', 'y'}:
        raise ValueError('Invalid link axis')
    anchors = {}
    for key in ('a', 'b'):
        endpoint = data[key]
        if endpoint['edge'] not in {'top', 'right', 'bottom', 'left'}:
            raise ValueError('Invalid anchor edge')
        anchors[key] = {'body': str(endpoint['body']), 'edge': endpoint['edge']}
    if anchors['a']['body'] == anchors['b']['body']:
        raise ValueError('A link must connect different elements')
    if anchors['b']['body'] == '$window':
        raise ValueError('The window must be the reference, not the dependent')
    return {'id': str(data['id']), 'axis': axis, **anchors,
            'distance_x': finite_number(data.get('distance_x', 0), 'X scalar'),
            'distance_y': finite_number(data.get('distance_y', 0), 'Y scalar')}


@dataclass
class WindowSettings:
    name: str = "MainWindow"
    title: str = "Untitled Project"
    icon: str = ""  # Embedded 32x32 PNG data URL, portable with the project.
    resizable: bool = True
    decorated: bool = True
    min_width: int = 200
    min_height: int = 100
    state: str = "normal"
    background_color: str = "#0f1b2f"

    def to_dict(self):
        from dataclasses import asdict
        return asdict(self)

    @classmethod
    def from_dict(cls, data, default_title="Untitled Project"):
        settings = cls(**{key: value for key, value in data.items() if key in cls.__dataclass_fields__})
        settings.title = str(data.get("title", default_title))
        settings.min_width = max(100, int(settings.min_width))
        settings.min_height = max(60, int(settings.min_height))
        if settings.state not in {"normal", "maximized", "fullscreen"}:
            raise ValueError("Invalid initial window state")
        import re
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", settings.background_color):
            raise ValueError("Invalid window background color")
        if settings.icon and not settings.icon.startswith("data:image/png;base64,"):
            raise ValueError("Window icon must be an embedded PNG")
        return settings


@dataclass
class Layout:
    x: float = 0.0
    y: float = 0.0
    width: float = 20.0
    height: float = 10.0
    min_width: int = 80
    min_height: int = 32

    def to_dict(self) -> dict[str, Any]:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "min_width": self.min_width,
            "min_height": self.min_height,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Layout":
        return cls(
            x=float(data.get("x", 0.0)),
            y=float(data.get("y", 0.0)),
            width=float(data.get("width", 20.0)),
            height=float(data.get("height", 10.0)),
            min_width=int(data.get("min_width", 80)),
            min_height=int(data.get("min_height", 32)),
        )


@dataclass
class Component:
    id: str
    type: str
    name: str
    text: str = ""
    layout: Layout = field(default_factory=Layout)
    style: dict[str, Any] = field(
        default_factory=lambda: {
            "font_size": 14,
            "font_weight": "500",
            "text_color": "#f4f6fb",
            "background_color": "#3b82f6",
            "border_radius": 10,
            "border_width": 1,
            "border_color": "#5b7cfa",
            "padding": 12,
            "visible": True,
            "enabled": True,
        }
    )
    visible: bool = True
    enabled: bool = True
    event_handlers: dict[str, str] = field(default_factory=dict)
    box: dict[str, Any] | None = None
    size_mode: str = 'fixed'

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "name": self.name,
            "text": self.text,
            "layout": self.layout.to_dict(),
            "style": self.style,
            "visible": self.visible,
            "enabled": self.enabled,
            "event_handlers": self.event_handlers,
            "box": self.box,
            "size_mode": self.size_mode,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Component":
        component = cls(
            id=str(data.get("id", "component")),
            type=str(data.get("type", "button")),
            name=str(data.get("name", "component")),
            text=str(data.get("text", "")),
            layout=Layout.from_dict(data.get("layout", {})),
            style=dict(data.get("style", {})),
            visible=bool(data.get("visible", True)),
            enabled=bool(data.get("enabled", True)),
            event_handlers=dict(data.get("event_handlers", {})),
            box=rectangle_definition(data.get('box', data.get('physics'))),
            size_mode=str(data.get('size_mode', 'fixed')),
        )
        if component.size_mode not in {'fixed', 'stretch'}:
            raise ValueError('Invalid component size mode')
        return component


@dataclass
class Project:
    name: str = "Untitled Project"
    description: str = ""
    version: int = 1
    canvas_width: int = 960
    canvas_height: int = 640
    components: list[Component] = field(default_factory=list)
    window: WindowSettings = field(default_factory=WindowSettings)
    links: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self):
        if self.window.title == "Untitled Project":
            self.window.title = self.name
        if self.canvas_width < self.window.min_width or self.canvas_height < self.window.min_height:
            raise ValueError("Window dimensions must be at least the minimum dimensions")
        ids = {c.id for c in self.components}
        if len(ids) != len(self.components) or '$window' in ids:
            raise ValueError('Component IDs must be unique and cannot use $window')
        link_ids = set()
        dependencies = {id: set() for id in ids}
        for link in self.links:
            if link['id'] in link_ids:
                raise ValueError('Link IDs must be unique')
            link_ids.add(link['id'])
            if any(link[key]['body'] not in ids | {'$window'} for key in ('a', 'b')):
                raise ValueError('Link references an unknown component')
            if link['a']['body'] != '$window':
                dependencies[link['b']['body']].add(link['a']['body'])
        completed = set()
        while dependencies:
            ready = {id for id, refs in dependencies.items() if refs <= completed}
            if not ready:
                raise ValueError('Anchor links cannot form a cycle')
            completed.update(ready)
            for id in ready:
                del dependencies[id]

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "canvas_width": self.canvas_width,
            "canvas_height": self.canvas_height,
            "components": [component.to_dict() for component in self.components],
            "window": self.window.to_dict(),
            "links": self.links,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Project":
        components = []
        for item in data.get('components', []):
            record = dict(item)
            # Preserve saved rectangles from the removed layout system without
            # retaining its dynamics or connections.
            if not record.get('box') and record.get('physics'):
                record['box'] = {**record['physics'], 'reference_width': data.get('canvas_width', 960),
                                 'reference_height': data.get('canvas_height', 640)}
            components.append(Component.from_dict(record))
        project = cls(
            name=str(data.get("name", "Untitled Project")),
            description=str(data.get("description", "")),
            version=int(data.get("version", 1)),
            canvas_width=int(data.get("canvas_width", 960)),
            canvas_height=int(data.get("canvas_height", 640)),
            components=components,
            window=WindowSettings.from_dict(data.get("window", {}), str(data.get("name", "Untitled Project"))),
            links=[link_definition(s) for s in data.get('links', [])],
        )
        return project
