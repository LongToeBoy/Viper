from __future__ import annotations

from typing import Any
from uuid import uuid4

from .models import Component, Layout, rectangle_definition


COMPONENT_LIBRARY: dict[str, dict[str, Any]] = {
    "button": {
        "type": "button",
        "name": "Button",
        "text": "Button",
        "layout": {"x": 20.0, "y": 20.0, "width": 24.0, "height": 12.0},
        "style": {
            "font_size": 14,
            "font_weight": "600",
            "text_color": "#ffffff",
            "background_color": "#2563eb",
            "border_radius": 10,
            "border_width": 1,
            "border_color": "#1d4ed8",
            "padding": 10,
        },
    },
    "label": {
        "type": "label",
        "name": "Label",
        "text": "Hello, Viper",
        "layout": {"x": 30.0, "y": 40.0, "width": 30.0, "height": 8.0},
        "style": {
            "font_size": 16,
            "font_weight": "500",
            "text_color": "#e5e7eb",
            "background_color": "#111827",
            "border_radius": 8,
            "border_width": 0,
            "border_color": "#374151",
            "padding": 8,
        },
    },
    "text_input": {
        "type": "text_input",
        "name": "Text Input",
        "text": "Text",
        "layout": {"x": 30.0, "y": 55.0, "width": 30.0, "height": 10.0},
        "style": {
            "font_size": 14,
            "font_weight": "400",
            "text_color": "#f3f4f6",
            "background_color": "#0f172a",
            "border_radius": 10,
            "border_width": 1,
            "border_color": "#475569",
            "padding": 12,
        },
    },
    "checkbox": {
        "type": "checkbox",
        "name": "Checkbox",
        "text": "Checkbox",
        "layout": {"x": 20.0, "y": 70.0, "width": 24.0, "height": 8.0},
        "style": {
            "font_size": 14,
            "font_weight": "500",
            "text_color": "#e2e8f0",
            "background_color": "#111827",
            "border_radius": 8,
            "border_width": 0,
            "border_color": "#475569",
            "padding": 8,
        },
    },
    "panel": {
        "type": "panel",
        "name": "Panel",
        "text": "Container",
        "layout": {"x": 55.0, "y": 20.0, "width": 25.0, "height": 40.0},
        "style": {
            "font_size": 16,
            "font_weight": "500",
            "text_color": "#f9fafb",
            "background_color": "#1f2937",
            "border_radius": 14,
            "border_width": 1,
            "border_color": "#374151",
            "padding": 14,
        },
    },
}


def create_component(component_type: str, *, name: str | None = None, **overrides: Any) -> Component:
    definition = COMPONENT_LIBRARY.get(component_type)
    if definition is None:
        raise ValueError(f"Unsupported component type: {component_type}")

    component_name = name or definition["name"]
    style = dict(definition["style"])
    style.update(overrides.pop("style", {}))

    layout_data = dict(definition["layout"])
    layout_data.update(overrides.pop("layout", {}))

    component = Component(
        id=overrides.pop("id", f"{component_type}_{uuid4().hex}"),
        type=definition["type"],
        name=component_name,
        text=str(overrides.pop("text", definition["text"])),
        layout=Layout(**layout_data),
        style=style,
        visible=bool(overrides.pop("visible", True)),
        enabled=bool(overrides.pop("enabled", True)),
        event_handlers=dict(overrides.pop("event_handlers", {})),
        box=rectangle_definition(overrides.pop('box', None)),
        size_mode=overrides.pop('size_mode', 'fixed'),
    )

    for key, value in overrides.items():
        component.style[key] = value

    return component


def list_component_types() -> list[str]:
    return list(COMPONENT_LIBRARY)
