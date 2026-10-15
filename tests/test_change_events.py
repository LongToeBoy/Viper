import pytest

from viper.app import ViperApp
from viper.component_registry import create_component
from viper.runtime import Runtime
from test_control_api import dispatch, example


def test_button_text_assignment_runs_label_change_with_sender_and_new_value():
    project = example('def clicked(event):\n    StatusLabel.Text = "Launched"\n    return "click result"\n')
    label = project.components[1]
    label.event_handlers['change'] = 'label_changed'
    project.event_code['label_changed'] = ('def label_changed(event):\n'
        '    assert event.sender.Name == "StatusLabel"\n'
        '    assert event["event"] == "change" and event["property"] == "Text"\n'
        '    assert event["window_id"] == event.form.id\n'
        '    NameInput.Text = event["value"] + ":" + event.sender.Text\n')
    original = project.to_dict()
    response = dispatch(Runtime(project))['result']
    assert response['value'] == 'click result'
    assert [item['properties'] for item in response['updates']] == [
        {'text': 'Launched'}, {'text': 'Launched:Launched'}]
    assert project.to_dict() == original


def test_repeated_same_value_and_net_unchanged_writes_do_not_fire_change():
    project = example('def clicked(event):\n    StatusLabel.Text = "Ready"\n')
    calls = []
    project.components[1].event_handlers['change'] = 'changed'
    runtime = Runtime(project, {'changed': lambda event: calls.append(event['value'])})
    assert 'updates' not in dispatch(runtime)['result']
    project.event_code['new_value'] = 'def new_value(event):\n    StatusLabel.Text = "New"\n'
    project.components[0].event_handlers['click'] = 'new_value'
    dispatch(runtime); dispatch(runtime)
    assert calls == ['New']
    project.event_code['restore'] = ('def restore(event):\n'
        '    StatusLabel.Text = "Temporary"\n    StatusLabel.Text = "New"\n'
        '    StatusLabel.Visible = False\n    StatusLabel.Enabled = False\n')
    project.components[0].event_handlers['click'] = 'restore'
    dispatch(runtime)
    assert calls == ['New']


@pytest.mark.parametrize(('kind', 'assignment', 'value', 'property_name'), [
    ('text_input', 'Value = "new"', 'new', 'Text'),
    ('checkbox', 'Checked = True', True, 'Checked'),
    ('checkbox', 'value = True', True, 'Checked'),
    ('checkbox', 'Text = "caption"', 'caption', 'Text'),
])
def test_value_aliases_and_checkbox_changes_deliver_typed_property_values(kind, assignment, value, property_name):
    project = example(f'def clicked(event):\n    Target.{assignment}\n')
    target = create_component(kind, name='Target', event_handlers={'change': 'changed'})
    project.components.append(target)
    calls = []
    result = dispatch(Runtime(project, {'changed': lambda event: calls.append((event['value'], event['property']))}))
    assert 'result' in result
    assert calls == [(value, property_name)]


def test_self_normalization_settles_without_repeating_identical_writes():
    project = example('def clicked(event):\n    NameInput.Text = "  hello  "\n')
    project.components[2].event_handlers['change'] = 'normalize'
    calls = []

    def normalize(event):
        calls.append(event['value'])
        event.sender.Text = event.sender.Text.strip()

    result = dispatch(Runtime(project, {'normalize': normalize}))['result']
    assert calls == ['  hello  ', 'hello']
    assert result['updates'][0]['properties'] == {'text': 'hello'}


def test_user_change_delivered_once_without_echo_from_input_snapshot():
    project = example('def clicked(event):\n    pass\n')
    target = project.components[2]
    target.event_handlers['change'] = 'changed'
    calls = []
    runtime = Runtime(project, {'changed': lambda event: calls.append(event['value'])})
    result = dispatch(runtime, component_id=target.id, event='change', value='Typed',
                      values={target.id: {'text': 'Typed'}})['result']
    assert calls == ['Typed'] and 'updates' not in result


@pytest.mark.parametrize('loop', [False, True])
def test_change_error_or_loop_rolls_back_entire_chain_and_queue_recovers(loop):
    project = example('def clicked(event):\n    StatusLabel.Text = "Start"\n')
    label, input_control = project.components[1:3]
    label.event_handlers['change'] = 'label_changed'
    if loop:
        project.event_code['label_changed'] = 'def label_changed(event):\n    NameInput.Text = StatusLabel.Text + "!"\n'
        input_control.event_handlers['change'] = 'input_changed'
        project.event_code['input_changed'] = 'def input_changed(event):\n    StatusLabel.Text = NameInput.Text + "!"\n'
    else:
        project.event_code['label_changed'] = 'def label_changed(event):\n    NameInput.Text = "Partial"\n    raise ValueError("change failed")\n'
    project.event_code['read'] = 'def read(event):\n    return [StatusLabel.Text, NameInput.Text]\n'
    runtime = Runtime(project)
    result = dispatch(runtime, values={input_control.id: {'text': 'Typed'}})
    assert ('did not settle' if loop else 'change failed') in result['error']
    project.components[0].event_handlers['click'] = 'read'
    assert dispatch(runtime)['result']['value'] == ['Ready', 'Typed']


def test_change_cascade_matches_preview_and_is_scoped_to_owning_window():
    project = example('def clicked(event):\n    StatusLabel.Text = "Changed"\n')
    project.components[1].event_handlers['change'] = 'changed'
    project.event_code['changed'] = 'def changed(event):\n    NameInput.Text = event.form.id\n'
    from viper.models import WindowDefinition
    other = WindowDefinition.from_dict({**project.get_window().to_dict(), 'form_id': 'other'})
    project.windows.append(other)
    runtime = Runtime(project)
    response = dispatch(runtime, window_id='other')['result']
    assert all(update['window_id'] == 'other' for update in response['updates'])
    assert dispatch(runtime, window_id='main')['result']['updates'][-1]['properties'] == {'text': 'main'}
    replies = []
    ViperApp(project).bridge.receive({'id': 1, 'command': 'event', 'payload': {
        'window_id': 'other', 'component_id': other.components[0].id, 'event': 'click'}}, replies.append)
    assert replies[-1]['result'] == response
