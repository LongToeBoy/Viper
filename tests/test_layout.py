from viper.app import ViperApp
from viper.layout import RelativeLayoutEngine


def test_relative_layout_conversion():
    app = ViperApp()
    engine = RelativeLayoutEngine(1000, 600)
    component = app.project.components[0]
    bounds = engine.compute_component_bounds(component, 1000, 600)

    assert bounds["width"] > 0
    assert bounds["height"] > 0
    assert bounds["x"] >= 0
    assert bounds["y"] >= 0


def test_layout_clamps_to_canvas():
    engine = RelativeLayoutEngine(400, 300)
    component = engine.compute_component_bounds(
        ViperApp().project.components[0],
        400,
        300,
    )
    assert component["x"] <= 400
    assert component["y"] <= 300
