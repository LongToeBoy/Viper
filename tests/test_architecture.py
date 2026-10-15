import ast
import json
from pathlib import Path

import pytest

from viper.app import ViperApp
from viper.component_registry import create_component
from viper.layout import RelativeLayoutEngine
from viper.runtime import Runtime
from viper.serializer import deserialize_project, serialize_project


def test_shared_code_has_no_native_imports():
    root = Path(__file__).resolve().parents[1] / "viper"
    for path in root.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert all(item.name.split('.')[0] not in {'gi', 'webview'} for item in node.names), path
            elif isinstance(node, ast.ImportFrom):
                assert (node.module or '').split('.')[0] not in {'gi', 'webview'}, path


def test_component_ids_are_unique_and_events_survive_round_trip():
    app = ViperApp()
    a, b = create_component('button'), create_component('button')
    assert a.id != b.id
    a.event_handlers = {'click': 'launch'}
    app.project.components = [a, b]
    restored = deserialize_project(json.loads(json.dumps(serialize_project(app.project))))
    assert restored.components[0].event_handlers == {'click': 'launch'}


def test_bridge_uses_project_state_and_replies_to_errors():
    app = ViperApp()
    replies = []
    app.bridge.receive({'id': 1, 'command': 'bootstrap'}, replies.append)
    project = replies[-1]['result']['project']
    project['name'] = 'Changed'
    app.bridge.receive({'id': 2, 'command': 'update', 'payload': {'project': project}}, replies.append)
    assert app.project.name == 'Changed'
    app.bridge.receive({'id': 3, 'command': 'invalid'}, replies.append)
    assert replies[-1]['id'] == 3 and 'error' in replies[-1]


def test_native_dialog_cancellation_and_save(tmp_path):
    app = ViperApp()
    replies = []

    class Host:
        path = None
        def file_dialog(self, save, callback):
            callback(self.path)

    app.host = Host()
    app.bridge.receive({'id': 1, 'command': 'save'}, replies.append)
    assert replies[-1]['result'] == {'cancelled': True}
    app.host.path = tmp_path / 'project.json'
    app.bridge.receive({'id': 2, 'command': 'save'}, replies.append)
    app.project.name = 'Unsaved'
    app.bridge.receive({'id': 3, 'command': 'open'}, replies.append)
    assert app.project.name == 'Demo Project'


def test_runtime_dispatches_only_registered_handlers():
    app = ViperApp()
    component = app.project.components[0]
    component.event_handlers['click'] = 'launch'
    runtime = Runtime(app.project, {'launch': lambda payload: payload['value']})
    replies = []
    runtime.receive({'id': 1, 'command': 'event', 'payload': {
        'component_id': component.id, 'event': 'click', 'value': 'ready'}}, replies.append)
    assert replies[-1]['result'] == {'handled': True, 'value': 'ready'}


def test_small_canvas_bounds_and_invalid_dimensions():
    component = create_component('button', layout={'x': 95, 'y': 95})
    engine = RelativeLayoutEngine()
    assert engine.compute_component_bounds(component, 20, 10) == {'x': 0, 'y': 0, 'width': 20, 'height': 10}
    with pytest.raises(ValueError):
        engine.compute_component_bounds(component, 0, 10)


def test_preview_and_runtime_use_the_same_event_api():
    app = ViperApp()
    component = app.project.components[0]
    component.event_handlers['click'] = 'launch'
    app.handlers['launch'] = lambda event: event['value']
    message = {'id': 1, 'command': 'event', 'payload': {
        'component_id': component.id, 'event': 'click', 'value': 'shared'}}
    preview, standalone = [], []
    app.bridge.receive(message, preview.append)
    Runtime(app.project, app.handlers).receive(message, standalone.append)
    assert preview == standalone == [{'id': 1, 'result': {'handled': True, 'value': 'shared'}}]


def test_unknown_project_schema_is_rejected():
    with pytest.raises(ValueError, match='schema'):
        deserialize_project({'schema_version': 3, 'project': {}})
