import json

import pytest

from viper.app import ViperApp
from viper.component_registry import create_component
from viper.models import Project, WindowDefinition
from viper.runtime import Runtime


def example(source):
    project = ViperApp.create_demo_project()
    project.components[0].event_handlers['click'] = 'clicked'
    project.event_code['clicked'] = source
    return project


def dispatch(runtime, *, window_id=None, component_id=None, event='click', **extra):
    payload = {'component_id': component_id or runtime.form.components[0].id, 'event': event, **extra}
    if window_id is not None:
        payload['window_id'] = window_id
    replies = []
    runtime.receive({'id': 1, 'command': 'event', 'payload': payload}, replies.append)
    return replies[-1]


def test_screenshot_handler_changes_text_without_changing_design_or_source():
    source = 'def clicked(event):\n    NameInput.Text="Hello World"\n'
    project = example(source)
    original = project.to_dict()
    runtime = Runtime(project)
    result = dispatch(runtime)['result']
    assert result == {'handled': True, 'value': None, 'updates': [{
        'window_id': 'main', 'component_id': project.components[2].id, 'properties': {'text': 'Hello World'}}]}
    assert project.to_dict() == original and project.event_code['clicked'] == source


def test_controls_read_current_typed_text_and_checkbox_state():
    project = example('def clicked(event):\n    StatusLabel.Text = NameInput.Text\n    return controls["Accept"].Checked\n')
    checkbox = create_component('checkbox', name='Accept')
    project.components.append(checkbox)
    result = dispatch(Runtime(project), values={project.components[2].id: {'text': 'Currently typed'}, checkbox.id: {'checked': True}})['result']
    assert result['value'] is True
    assert result['updates'][0]['properties'] == {'text': 'Currently typed'}


def test_event_remains_a_json_dictionary_with_control_attributes_for_registered_handlers():
    project = example('def clicked(event):\n    pass\n')

    def clicked(event):
        event.controls.NameInput.Text = 'Registered handler'
        assert event.sender.Name == 'Launch'
        assert event.form.id == 'main' and event.form.controls is event.controls
        return event

    result = dispatch(Runtime(project, {'clicked': clicked}), value='original event value')['result']
    assert result['value']['value'] == 'original event value'
    assert 'controls' not in json.loads(json.dumps(result['value']))
    assert result['updates'][0]['properties'] == {'text': 'Registered handler'}


def test_ui_state_is_shared_between_handlers_and_repeated_calls():
    project = example('def clicked(event):\n    StatusLabel.Text = StatusLabel.Text + "!"\n')
    project.components[2].event_handlers['change'] = 'changed'
    project.event_code['changed'] = 'def changed(event):\n    return StatusLabel.Text + ":" + event.sender.Text\n'
    runtime = Runtime(project)
    dispatch(runtime); dispatch(runtime)
    result = dispatch(runtime, component_id=project.components[2].id, event='change', value='new input')['result']
    assert result['value'] == 'Ready!!:new input'
    assert project.components[1].text == 'Ready' and project.components[2].text == 'Alice'


def test_shared_handler_names_bind_to_their_own_window_and_cache_globals_separately():
    forms = []
    for form_id, text in [('main', 'First'), ('second', 'Second')]:
        forms.append(WindowDefinition(form_id=form_id, components=[
            create_component('button', id='launch', name='Launch', event_handlers={'click': 'clicked'}),
            create_component('text_input', id='input', name='NameInput', text=text)]))
    project = Project(windows=forms, event_code={'clicked':
        'count = 0\ndef clicked(event):\n    global count\n    count += 1\n    NameInput.Text += "!"\n    return count\n'})
    runtime = Runtime(project)
    first = dispatch(runtime, window_id='main')['result']
    second = dispatch(runtime, window_id='second')['result']
    again = dispatch(runtime, window_id='main')['result']
    assert [first['value'], second['value'], again['value']] == [1, 1, 2]
    assert [result['updates'][0]['properties']['text'] for result in [first, second, again]] == ['First!', 'Second!', 'First!!']
    assert second['updates'][0]['window_id'] == 'second'


def test_duplicate_names_fail_only_when_used_and_ids_remain_available():
    project = example('def clicked(event):\n    return "unrelated"\n')
    project.components.append(create_component('text_input', name='NameInput'))
    assert dispatch(Runtime(project))['result']['value'] == 'unrelated'
    project.event_code['clicked'] = 'def clicked(event):\n    NameInput.Text = "ambiguous"\n'
    assert 'Multiple controls' in dispatch(Runtime(project))['error']
    project.event_code['clicked'] = f'def clicked(event):\n    event.controls.by_id({project.components[2].id!r}).Text = "by ID"\n'
    assert dispatch(Runtime(project))['result']['updates'][0]['properties'] == {'text': 'by ID'}


def test_non_identifier_and_reserved_names_use_explicit_lookup_without_shadowing_builtins():
    project = example('def clicked(event):\n    controls["Text Input"].Text = str(len(controls))\n    controls["controls"].Text = "explicit"\n')
    project.components[2].name = 'Text Input'
    project.components.extend([create_component('label', name='len'), create_component('label', name='controls')])
    result = dispatch(Runtime(project))['result']
    assert [update['properties']['text'] for update in result['updates']] == ['6', 'explicit']


@pytest.mark.parametrize('statement', [
    'NameInput.Texxt = "typo"', 'NameInput.Enabled = "yes"', 'NameInput.Text = 123',
    'NameInput.Checked = True', 'NameInput.Name = "renamed"', 'MissingInput.Text = "unknown"'])
def test_invalid_api_use_reports_an_error_and_rolls_back_ui_writes(statement):
    project = example(f'def clicked(event):\n    StatusLabel.Text = "partial"\n    {statement}\n')
    runtime = Runtime(project)
    response = dispatch(runtime, values={project.components[2].id: {'text': 'User typing'}})
    assert response['error'] and 'result' not in response
    project.components[0].event_handlers['click'] = 'read_state'
    project.event_code['read_state'] = 'def read_state(event):\n    return [StatusLabel.Text, NameInput.Text]\n'
    assert dispatch(runtime)['result']['value'] == ['Ready', 'User typing']


def test_only_input_values_are_ingested_and_validation_does_not_apply_partial_snapshots():
    project = example('def clicked(event):\n    return NameInput.Text\n')
    runtime = Runtime(project)
    invalid = dispatch(runtime, values={project.components[2].id: {'text': 'partial'}, project.components[1].id: {'text': 'forged label'}})
    assert 'Only text input' in invalid['error']
    assert dispatch(runtime)['result']['value'] == 'Alice'


def test_all_supported_control_properties_and_value_aliases_produce_one_patch_each():
    project = example('def clicked(event):\n    NameInput.Value = "value alias"\n    NameInput.visible = False\n    NameInput.Enabled = False\n    Accept.Value = True\n    Accept.Text = "Accepted"\n')
    project.components.append(create_component('checkbox', name='Accept'))
    result = dispatch(Runtime(project))['result']
    assert result['updates'][0]['properties'] == {'text': 'value alias', 'enabled': False, 'visible': False}
    assert result['updates'][1]['properties'] == {'text': 'Accepted', 'checked': True}


def test_preview_state_survives_unchanged_saves_and_resets_on_new_preview():
    project = example('def clicked(event):\n    StatusLabel.Text += "!"\n    return StatusLabel.Text\n')
    app = ViperApp(project)
    request = {'id': 1, 'command': 'event', 'payload': {'component_id': project.components[0].id, 'event': 'click'}}
    replies = []
    app.bridge.receive(request, replies.append)
    app.bridge.receive({'id': 2, 'command': 'update', 'payload': {'project': project.to_dict()}}, replies.append)
    app.bridge.receive(request, replies.append)
    assert replies[-1]['result']['value'] == 'Ready!!'
    app.bridge.receive({'id': 3, 'command': 'reset-preview'}, replies.append)
    app.bridge.receive(request, replies.append)
    assert replies[-1]['result']['value'] == 'Ready!'
    assert app.project.components[1].text == 'Ready'


def test_non_json_return_does_not_commit_ui_mutations():
    project = example('def clicked(event):\n    NameInput.Text = "partial"\n    return event.sender\n')
    runtime = Runtime(project)
    assert 'not JSON serializable' in dispatch(runtime)['error']
    project.components[0].event_handlers['click'] = 'read_state'
    project.event_code['read_state'] = 'def read_state(event):\n    return NameInput.Text\n'
    assert dispatch(runtime)['result']['value'] == 'Alice'
