from __future__ import annotations

from typing import Any

from .models import Component


class RelativeLayoutEngine:
    """Applies percentage-based layouts relative to the parent container."""

    def __init__(self, canvas_width: float = 960, canvas_height: float = 640):
        self.canvas_width = float(canvas_width)
        self.canvas_height = float(canvas_height)

    def percentage_to_pixels(self, value: float, axis_size: float) -> float:
        return (float(value) / 100.0) * float(axis_size)

    def compute_component_bounds(self, component: Component, canvas_width: float | None = None, canvas_height: float | None = None) -> dict[str, float]:
        width = float(self.canvas_width if canvas_width is None else canvas_width)
        height = float(self.canvas_height if canvas_height is None else canvas_height)
        if width <= 0 or height <= 0:
            raise ValueError("Canvas dimensions must be positive")

        x_px = self.percentage_to_pixels(component.layout.x, width)
        y_px = self.percentage_to_pixels(component.layout.y, height)
        w_px = self.percentage_to_pixels(component.layout.width, width)
        h_px = self.percentage_to_pixels(component.layout.height, height)

        min_w = float(component.layout.min_width)
        min_h = float(component.layout.min_height)

        w_px = min(width, max(min_w, w_px))
        h_px = min(height, max(min_h, h_px))

        x_px = min(max(x_px, 0.0), max(0.0, width - w_px))
        y_px = min(max(y_px, 0.0), max(0.0, height - h_px))

        return {
            "x": x_px,
            "y": y_px,
            "width": w_px,
            "height": h_px,
        }

    def fit_project(self, project: Any) -> list[dict[str, float]]:
        canvas_width = float(project.canvas_width)
        canvas_height = float(project.canvas_height)
        computed: list[dict[str, float]] = []

        for component in project.components:
            computed.append(self.compute_component_bounds(component, canvas_width, canvas_height))
        return computed

    def sanitize(self, component: Component, canvas_width: float | None = None, canvas_height: float | None = None) -> Component:
        bounds = self.compute_component_bounds(component, canvas_width, canvas_height)
        component.layout.x = (bounds["x"] / (canvas_width or self.canvas_width)) * 100.0
        component.layout.y = (bounds["y"] / (canvas_height or self.canvas_height)) * 100.0
        component.layout.width = (bounds["width"] / (canvas_width or self.canvas_width)) * 100.0
        component.layout.height = (bounds["height"] / (canvas_height or self.canvas_height)) * 100.0
        return component
