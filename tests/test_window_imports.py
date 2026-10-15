import builtins
import json
from importlib import metadata
import zipfile

import pytest

from viper.app import ViperApp
from viper.build import export_project, validate_project
from viper.models import Project, WindowDefinition
from viper.runtime import Runtime
from viper.serializer import load_project, save_project


def project_with_imports(imports, source='def clicked(event):\n    return number.Fraction(1, 2).numerator\n'):
    project = ViperApp.create_demo_project()
    project.get_window().imports = imports
    project.components[0].event_handlers = {'click':'clicked'}
    project.event_code = {'clicked':source}
    return project


def dispatch(runtime, component=None, window=None):
    form = window or runtime.form
    replies = []
    runtime.receive({'id':1, 'command':'event', 'payload':{
        'window_id':form.form_id, 'component_id':(component or form.components[0]).id, 'event':'click'}}, replies.append)
    return replies[0]


def test_imports_and_incomplete_drafts_round_trip_verbatim(tmp_path):
    source = '# window notes\nimport fractions as number\nfrom math import (\n'
    project = project_with_imports(source)
    saved_source = dict(project.event_code)
    restored = load_project(save_project(project, tmp_path / 'imports.json'))
    assert restored.get_window().imports == source
    assert restored.event_code == saved_source
    assert WindowDefinition.from_dict({}).imports == ''
    with pytest.raises(ValueError, match='imports'):
        WindowDefinition.from_dict({'imports':['numpy']})


def test_window_aliases_are_shared_between_handlers_but_cached_only_once(monkeypatch):
    project = project_with_imports('import fractions as number\nfrom math import sqrt as root\n')
    second = project.components[1]
    second.event_handlers = {'click':'another'}
    project.event_code['another'] = 'def another(event):\n    return root(number.Fraction(9, 1))\n'
    original = project.to_dict()
    original_import = builtins.__import__
    calls = []
    def track(name, *args, **kwargs):
        if name in {'fractions', 'math'}:
            calls.append(name)
        return original_import(name, *args, **kwargs)
    runtime = Runtime(project)
    # Load the standard modules before counting imports from the user's block.
    original_import('fractions'); original_import('math')
    monkeypatch.setattr(builtins, '__import__', track)
    assert dispatch(runtime)['result']['value'] == 1
    assert dispatch(runtime, second)['result']['value'] == 3
    assert dispatch(runtime)['result']['value'] == 1
    assert calls == ['fractions', 'math']
    assert project.to_dict() == original


def test_same_handler_uses_the_owning_windows_import_aliases():
    project = project_with_imports('import fractions as module\n', 'def clicked(event):\n    return module.__name__\n')
    second = WindowDefinition.from_dict({**project.get_window().to_dict(), 'form_id':'second', 'imports':'import calendar as module\n'})
    project.windows.append(second)
    third = WindowDefinition.from_dict({**second.to_dict(), 'form_id':'third', 'imports':''})
    project.windows.append(third)
    runtime = Runtime(project)
    assert dispatch(runtime)['result']['value'] == 'fractions'
    assert dispatch(runtime, window=second)['result']['value'] == 'calendar'
    assert 'module' in dispatch(runtime, window=third)['error']
    assert dispatch(runtime)['result']['value'] == 'fractions'


def test_import_aliases_take_precedence_over_automatic_control_names():
    project = project_with_imports('import fractions as number\n')
    project.components[1].name = 'number'
    project.event_code['clicked'] = 'def clicked(event):\n    controls["number"].Text = str(number.Fraction(1, 2))\n'
    result = dispatch(Runtime(project))['result']
    assert result['updates'][0]['properties']['text'] == '1/2'


def test_imports_load_lazily_and_registered_handlers_keep_their_own_globals():
    project = project_with_imports('import viper_missing_library_12345\n')
    replies = []
    runtime = Runtime(project)
    runtime.receive({'id':1, 'command':'bootstrap'}, replies.append)
    assert 'error' not in replies[0]
    failure = dispatch(runtime)
    assert "Imports for window 'MainWindow'" in failure['error'] and 'viper_missing_library' in failure['error']
    assert 'main' not in runtime._window_imports
    registered = Runtime(project, {'clicked':lambda event:'registered'})
    assert dispatch(registered)['result']['value'] == 'registered'


@pytest.mark.parametrize('source', ['from math import (', 'value = 3', 'print("side effect")',
                                  'from .helpers import x', 'from math import *',
                                  'import math as controls', 'from math import sqrt as form'])
def test_invalid_import_blocks_report_the_window_without_executing(source):
    project = project_with_imports(source)
    with pytest.raises(ValueError, match="Imports for window 'MainWindow'"):
        validate_project(project)
    assert "Imports for window 'MainWindow'" in dispatch(Runtime(project))['error']
    assert project.get_window().imports == source


def test_preview_import_edits_reset_the_runtime_without_rewriting_handler_source():
    project = project_with_imports('import fractions as module\n', 'def clicked(event):\n    return module.__name__\n')
    app = ViperApp(project)
    def event():
        replies = []
        app.bridge.receive({'id':2, 'command':'event', 'payload':{
            'window_id':project.form_id, 'component_id':project.components[0].id, 'event':'click'}}, replies.append)
        return replies[0]['result']['value']
    assert event() == 'fractions'
    snapshot = project.to_dict(); snapshot['windows'][0]['imports'] = 'import calendar as module\n'
    replies = []
    app.bridge.receive({'id':1, 'command':'update', 'payload':{'project':snapshot}}, replies.append)
    assert event() == 'calendar'
    assert app.project.event_code == project.event_code


def test_exports_collect_import_dependencies_from_all_windows_without_executing_them(monkeypatch, tmp_path):
    project = project_with_imports('import packaging.version as version\n', 'def clicked(event):\n    return str(version.Version("1.2"))\n')
    project.windows.append(WindowDefinition(form_id='second', imports='from fractions import Fraction\n'))
    original = project.to_dict()
    assert validate_project(project) == ['fractions', 'packaging.version']
    original_import = builtins.__import__
    def reject_user_imports(name, *args, **kwargs):
        if name == 'packaging.version':
            pytest.fail('Export must not execute window imports')
        return original_import(name, *args, **kwargs)
    monkeypatch.setattr(builtins, '__import__', reject_user_imports)
    path = export_project(project, tmp_path / 'python.zip', format='python')
    with zipfile.ZipFile(path) as archive:
        assert json.loads(archive.read('Demo-Project/project.json'))['project'] == original
        assert f'packaging=={metadata.version("packaging")}' in archive.read('Demo-Project/requirements.txt').decode()
    assert project.to_dict() == original
