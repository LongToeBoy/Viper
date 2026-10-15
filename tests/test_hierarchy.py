import json

import pytest

from viper.app import ViperApp
from viper.component_registry import create_component
from viper.models import Project, WindowDefinition, WindowSettings
from viper.runtime import Runtime
from viper.serializer import deserialize_project, serialize_project


def test_project_is_the_owner_of_all_sibling_windows():
    project = Project(name='Application')
    first = project.windows[0]
    second = WindowDefinition(form_id='settings', window=WindowSettings(name='Settings'))
    project.windows.append(second)
    data = serialize_project(project)
    assert data['schema_version'] == 2
    assert 'components' not in data['project'] and 'window' not in data['project']
    assert [form['form_id'] for form in data['project']['windows']] == ['main', 'settings']
    assert project.get_window() is first and project.get_window('settings') is second
    project.name = 'Renamed application'
    assert first.window.name == 'MainWindow' and second.window.name == 'Settings'


def test_schema_one_migrates_startup_form_extras_and_exact_source():
    first = WindowDefinition(components=[create_component('button')])
    second = WindowDefinition(form_id='other', components=[create_component('text_input')])
    source = '# Preserved\ndef user(event):\n    return event\n'
    first.components[0].event_handlers = {'click': 'user'}
    legacy = {'schema_version': 1, 'project': {**first.to_dict(), 'name': 'Older project',
              'windows': [second.to_dict()], 'event_code': {'user': source}}}
    migrated = deserialize_project(json.loads(json.dumps(legacy)))
    assert len(migrated.windows) == 2 and migrated.startup_window_id == 'main'
    assert migrated.windows[0].components[0].event_handlers == {'click': 'user'}
    assert migrated.event_code == {'user': source}
    saved = serialize_project(migrated)
    assert saved['schema_version'] == 2 and 'components' not in saved['project']
    assert deserialize_project(saved).to_dict() == migrated.to_dict()


def test_startup_window_can_be_any_child_and_survives_round_trip():
    first = WindowDefinition()
    second = WindowDefinition(form_id='settings', window=WindowSettings(title='Settings native window'))
    project = Project(windows=[first, second], startup_window_id='settings')
    restored = deserialize_project(serialize_project(project))
    runtime = Runtime(restored)
    assert runtime.form.form_id == 'settings' and runtime.form.window.title == 'Settings native window'
    with pytest.raises(ValueError, match='Startup window'):
        Project(windows=[first], startup_window_id='not-a-child')


def test_delete_startup_window_keeps_sibling_ids_links_handlers_and_all_source():
    second = WindowDefinition(form_id='second', components=[create_component('button', event_handlers={'click': 'shared'})])
    source = 'def shared(event):\n    return 42\n'
    project = Project(windows=[WindowDefinition(), second], event_code={'shared': source, 'unmapped': '# draft'})
    sibling = second.to_dict()
    project.delete_window('main')
    assert project.startup_window_id == 'second' and project.windows[0].to_dict() == sibling
    assert project.event_code == {'shared': source, 'unmapped': '# draft'}
    assert Runtime(project).form is second
    with pytest.raises(ValueError, match='Unknown window'):
        project.delete_window('missing')
    assert project.windows[0].to_dict() == sibling


def test_empty_project_can_save_open_and_recover_without_deleting_source():
    project = Project(event_code={'draft': '# User draft'})
    project.delete_window('main')
    restored = deserialize_project(serialize_project(project))
    assert restored.windows == [] and restored.startup_window_id is None
    assert restored.event_code == {'draft': '# User draft'}
    app = ViperApp(restored)
    replies = []
    app.bridge.receive({'id': 1, 'command': 'bootstrap'}, replies.append)
    assert replies[0]['result']['project']['windows'] == []
    assert replies[0]['result']['window_defaults']['window']['name'] == 'MainWindow'
    with pytest.raises(ValueError, match='no startup window'):
        Runtime(restored)
    restored.windows.append(WindowDefinition(form_id='new'))
    restored.startup_window_id = 'new'
    assert Runtime(restored).form.form_id == 'new'


def test_component_identity_and_events_are_scoped_to_the_parent_window():
    first = WindowDefinition(components=[create_component('button', id='same', event_handlers={'click': 'one'})])
    second = WindowDefinition(form_id='second', components=[create_component('button', id='same', event_handlers={'click': 'two'})])
    project = Project(windows=[first, second])
    runtime = Runtime(project, {'one': lambda event: 1, 'two': lambda event: 2})
    replies = []
    for form_id in ['main', 'second']:
        runtime.receive({'id': 1, 'command': 'event', 'payload': {'window_id': form_id,
            'component_id': 'same', 'event': 'click'}}, replies.append)
    assert [reply['result']['value'] for reply in replies] == [1, 2]
    runtime.receive({'id': 1, 'command': 'event', 'payload': {'window_id': 'second',
        'component_id': 'deleted', 'event': 'click'}}, replies.append)
    assert 'Unknown component' in replies[-1]['error']
    app = ViperApp(project)
    component = app.add_component('label', window_id='second')
    assert component in second.components and component not in first.components


def test_anchors_cannot_refer_to_a_sibling_windows_component():
    first = WindowDefinition(components=[create_component('button', id='only-in-first')])
    second = WindowDefinition(form_id='second', components=[create_component('label', id='second-label')])
    data = Project(windows=[first, second]).to_dict()
    data['windows'][1]['links'] = [{'id': 'cross-window', 'a': {'body': 'only-in-first', 'edge': 'right'},
                                  'b': {'body': 'second-label', 'edge': 'left'}}]
    with pytest.raises(ValueError, match='unknown component'):
        Project.from_dict(data)


def test_legacy_python_startup_accessors_delegate_without_duplicate_ownership():
    project = Project(name='API', canvas_width=800, canvas_height=500,
                      window=WindowSettings(title='API window'), components=[create_component('label')])
    assert project.canvas_width == 800 and project.window is project.windows[0].window
    project.canvas_height = 600
    project.components = [create_component('button')]
    assert project.windows[0].canvas_height == 600 and project.windows[0].components[0].type == 'button'
    assert len(project.to_dict()['windows']) == 1
