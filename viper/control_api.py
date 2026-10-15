"""Host-independent control objects backed by transient runtime state."""
from collections.abc import Mapping
from dataclasses import dataclass
import builtins
import keyword


class Control:
    __slots__ = ('_component', '_state')
    _properties = {'Text': 'text', 'text': 'text', 'Enabled': 'enabled', 'enabled': 'enabled',
                   'Visible': 'visible', 'visible': 'visible', 'Checked': 'checked', 'checked': 'checked'}

    def __init__(self, component, state):
        object.__setattr__(self, '_component', component)
        object.__setattr__(self, '_state', state)

    def _property(self, name):
        if name in ('Value', 'value'):
            if self._component.type == 'text_input':
                return 'text'
            if self._component.type == 'checkbox':
                return 'checked'
        key = self._properties.get(name)
        if key and (key != 'checked' or self._component.type == 'checkbox'):
            return key
        raise AttributeError(f'{self._component.name} has no writable property {name!r}. '
                             'Use Text, Enabled, Visible, or Checked for a checkbox.')

    def __getattr__(self, name):
        if name in ('Name', 'name'):
            return self._component.name
        if name in ('Id', 'id'):
            return self._component.id
        return self._state[self._component.id][self._property(name)]

    def __setattr__(self, name, value):
        key = self._property(name)
        if key == 'text':
            if not isinstance(value, str):
                raise TypeError(f'{self._component.name}.Text must be a string')
        elif not isinstance(value, bool):
            raise TypeError(f'{self._component.name}.{name} must be True or False')
        self._state[self._component.id][key] = value


class _NamedControl:
    """Resolve a name on access so unrelated duplicate names do not block handlers."""
    __slots__ = ('_controls', '_name')

    def __init__(self, controls, name):
        object.__setattr__(self, '_controls', controls)
        object.__setattr__(self, '_name', name)

    def __getattr__(self, name):
        return getattr(self._controls[self._name], name)

    def __setattr__(self, name, value):
        setattr(self._controls[self._name], name, value)


class Controls(Mapping):
    def __init__(self, form, state):
        self._by_id = {component.id: Control(component, state) for component in form.components}
        self._names = {}
        for component in form.components:
            self._names.setdefault(component.name, []).append(component.id)

    def __getitem__(self, name):
        ids = self._names.get(name)
        if not ids:
            raise KeyError(f'No control named {name!r} in this window')
        if len(ids) != 1:
            raise LookupError(f'Multiple controls are named {name!r}; use event.controls.by_id(component_id)')
        return self._by_id[ids[0]]

    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(str(exc)) from None

    def __iter__(self):
        return iter(self._names)

    def __len__(self):
        return len(self._names)

    def by_id(self, component_id):
        try:
            return self._by_id[component_id]
        except KeyError:
            raise KeyError(f'No control with ID {component_id!r} in this window') from None

    def bindings(self, handler_name):
        reserved = set(vars(builtins)) | {handler_name, 'controls', 'form', 'event'}
        return {name: _NamedControl(self, name) for name in self._names
                if name.isidentifier() and not keyword.iskeyword(name) and not name.startswith('_') and name not in reserved}


@dataclass(frozen=True)
class FormContext:
    id: str
    name: str
    controls: Controls


class Event(dict):
    """Keep JSON-compatible event keys, with control access through attributes."""
    def __init__(self, payload, form, controls, component_id):
        super().__init__(payload)
        self.controls = controls
        self.sender = controls.by_id(component_id)
        self.form = FormContext(form.form_id, form.window.name, controls)


class ControlState:
    def __init__(self):
        self.values = {}
        self.contexts = {}

    def controls(self, form):
        if form.form_id not in self.values:
            self.values[form.form_id] = {component.id: {
                'text': component.text, 'enabled': component.enabled, 'visible': component.visible,
                **({'checked': False} if component.type == 'checkbox' else {})} for component in form.components}
            self.contexts[form.form_id] = Controls(form, self.values[form.form_id])
        return self.contexts[form.form_id]

    def ingest(self, form, payload):
        self.controls(form)
        incoming = payload.get('values', {})
        if not isinstance(incoming, dict):
            raise ValueError('Control values must be an object')
        by_id = {component.id: component for component in form.components}
        changes = {}
        for component_id, properties in incoming.items():
            component = by_id.get(component_id)
            if component is None or not isinstance(properties, dict):
                raise ValueError(f'Invalid control values for {component_id!r}')
            key = 'text' if component.type == 'text_input' else 'checked' if component.type == 'checkbox' else None
            if any(name != key for name in properties):
                raise ValueError('Only text input values and checkbox state can be supplied by the interface')
            if key in properties:
                value = properties[key]
                if not isinstance(value, str if key == 'text' else bool):
                    raise ValueError(f'Invalid {key} value for {component.name}')
                changes[component_id] = {key: value}
        # Existing clients can still send only the original event value.
        sender = by_id[payload['component_id']]
        value = payload.get('value')
        if sender.id not in incoming:
            if sender.type == 'text_input' and isinstance(value, str):
                changes[sender.id] = {'text': value}
            elif sender.type == 'checkbox' and isinstance(value, bool):
                changes[sender.id] = {'checked': value}
        for component_id, properties in changes.items():
            self.values[form.form_id][component_id].update(properties)

    def updates(self, form, before):
        result = []
        for component_id, properties in self.values[form.form_id].items():
            changed = {key: value for key, value in properties.items() if before[component_id][key] != value}
            if changed:
                result.append({'window_id': form.form_id, 'component_id': component_id, 'properties': changed})
        return result
