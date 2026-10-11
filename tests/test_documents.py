import json
from pathlib import Path

import pytest

from viper.app import ViperApp
from viper.component_registry import create_component
from viper.models import Project, WindowDefinition, WindowSettings
from viper.runtime import Runtime
from viper.serializer import load_project, save_project


def event(component, window_id='main'):
    return {'id': 1, 'command': 'event', 'payload': {
        'window_id': window_id, 'component_id': component.id, 'event': 'click', 'value': 'typed'}}


def test_forms_and_unfinished_source_round_trip(tmp_path):
    component = create_component('button', event_handlers={'click': 'user_handler'})
    form = WindowDefinition(form_id='settings', window=WindowSettings(name='Settings', title='Settings'),
                            components=[component], canvas_width=700, canvas_height=500)
    source = '# User notes and incomplete edits must survive exactly.\ndef user_handler(event):\n    '
    project = Project(windows=[form], event_code={'user_handler': source})
    restored = load_project(save_project(project, tmp_path / 'project.json'))
    assert restored.windows[0].to_dict() == form.to_dict()
    assert restored.event_code['user_handler'] == source
    assert restored.get_window('main') is restored
    legacy = Project.from_dict({'name': 'Legacy'})
    assert legacy.windows == [] and legacy.event_code == {} and legacy.form_id == 'main'


def test_form_identity_and_constraints_are_validated():
    with pytest.raises(ValueError, match='Window IDs'):
        Project(windows=[WindowDefinition()])
    with pytest.raises(ValueError, match='Window IDs'):
        Project(windows=[WindowDefinition(form_id='a'), WindowDefinition(form_id='a')])
    with pytest.raises(ValueError, match='minimum'):
        Project.from_dict({'windows': [{'form_id': 'small', 'canvas_width': 10}]})
    with pytest.raises(ValueError, match='unknown component'):
        Project.from_dict({'windows': [{'form_id': 'linked', 'links': [{'id': 'bad',
            'a': {'body': '$window', 'edge': 'left'}, 'b': {'body': 'missing', 'edge': 'left'}}]}]})


def test_authored_events_share_preview_and_runtime_dispatch():
    component = create_component('button', event_handlers={'click': 'authored'})
    form = WindowDefinition(form_id='second', components=[component], window=WindowSettings(title='Second'))
    project = Project(windows=[form], event_code={'authored':
        'def authored(event):\n    return event["window_id"] + ":" + event["value"]\n'})
    app = ViperApp(project)
    preview, run = [], []
    app.bridge.receive(event(component, 'second'), preview.append)
    Runtime(project, window_id='second').receive(event(component, 'second'), run.append)
    assert preview == run == [{'id': 1, 'result': {'handled': True, 'value': 'second:typed'}}]
    # A source edit invalidates Preview's compiled handler cache through update.
    edited = json.loads(json.dumps(project.to_dict()))
    edited['event_code']['authored'] = 'def authored(event):\n    return "new source"\n'
    app.bridge.receive({'id': 2, 'command': 'update', 'payload': {'project': edited}}, preview.append)
    app.bridge.receive(event(component, 'second'), preview.append)
    assert preview[-1]['result']['value'] == 'new source'


def test_source_only_executes_on_dispatch_and_registered_handlers_take_precedence():
    component = create_component('button', event_handlers={'click': 'authored'})
    project = Project(components=[component], event_code={'authored': 'raise RuntimeError("executed")'})
    runtime = Runtime(project)
    replies = []
    runtime.receive({'id': 1, 'command': 'bootstrap'}, replies.append)
    assert 'error' not in replies[-1]
    runtime.receive(event(component), replies.append)
    assert replies[-1]['error'] == 'executed'
    Runtime(project, {'authored': lambda payload: 'registered'}).receive(event(component), replies.append)
    assert replies[-1]['result']['value'] == 'registered'
    assert project.event_code['authored'] == 'raise RuntimeError("executed")'


def test_runtime_opens_selected_form_with_its_own_properties():
    form = WindowDefinition(form_id='second', components=[create_component('label')], canvas_width=700,
                            canvas_height=500, window=WindowSettings(title='Second form', resizable=False))
    project = Project(windows=[form])

    class Host:
        def run(self, interface, receive, options):
            self.options = options
            self.replies = []
            receive({'id': 1, 'command': 'bootstrap'}, self.replies.append)

    host = Host()
    Runtime(project, window_id='second').launch(host)
    assert host.options.title == 'Second form' and host.options.width == 700 and host.options.height == 500
    assert not host.options.resizable
    assert host.replies[0]['result']['project']['components'][0]['type'] == 'label'
    with pytest.raises(ValueError, match='Unknown window'):
        Runtime(project, window_id='missing')


def test_run_snapshots_all_forms_and_source_for_the_selected_window(monkeypatch):
    from viper import runtime

    project = Project(windows=[WindowDefinition(form_id='second')], event_code={'user': '# User source\n'})
    captured = {}

    def launch(args, cwd):
        path = Path(args[3])
        try:
            captured.update(args=args, cwd=cwd, project=load_project(path))
        finally:
            path.unlink()
        return 'process'

    monkeypatch.setattr(runtime.subprocess, 'Popen', launch)
    app = ViperApp(project)
    replies = []
    app.bridge.receive({'id': 1, 'command': 'run', 'payload': {'window_id': 'second'}}, replies.append)
    assert replies == [{'id': 1, 'result': {'started': True}}]
    assert captured['args'][-2:] == ['--window', 'second']
    assert captured['project'].windows[0].form_id == 'second'
    assert captured['project'].event_code == project.event_code
    assert captured['cwd'] == Path(runtime.__file__).resolve().parent.parent
