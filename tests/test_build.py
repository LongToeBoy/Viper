import json
from importlib import metadata
import subprocess
import sys
import threading
import zipfile
from pathlib import Path

import pytest

from viper.app import ViperApp
from viper.build import application_name, export_project, python_requirements, validate_project
from viper.models import Project, WindowDefinition


class StubBuilder:
    def check_available(self):
        pass

    def build(self, staging, name, imports, window, report):
        self.imports, self.window = imports, window
        folder = staging / 'bundle'
        resources = folder / '_internal'
        resources.mkdir(parents=True)
        (folder / f'{name}.exe').write_bytes(b'test executable')
        (resources / 'project.json').write_bytes((staging / 'project.json').read_bytes())
        (resources / 'launch.py').write_bytes((staging / 'launch.py').read_bytes())
        return folder


def buildable():
    project = ViperApp.create_demo_project()
    project.components[0].event_handlers['click'] = 'clicked'
    project.event_code['clicked'] = '# Keep this exactly.\nfrom fractions import Fraction\ndef clicked(event):\n    StatusLabel.Text = str(Fraction(1, 2))\n'
    return project


def test_archive_contains_verbatim_project_and_portable_launcher_and_respects_startup(tmp_path):
    project = buildable()
    second = WindowDefinition(form_id='second')
    second.window.title = 'Chosen startup'
    project.windows.append(second)
    project.startup_window_id = second.form_id
    original = project.to_dict()
    builder = StubBuilder()
    result = export_project(project, tmp_path / 'With spaces' / 'app.zip', builder=builder)
    with zipfile.ZipFile(result) as archive:
        root = application_name(project.name)
        saved = json.loads(archive.read(f'{root}/_internal/project.json'))['project']
        assert saved == original
        launcher = archive.read(f'{root}/_internal/launch.py').decode()
        assert 'Path(__file__).resolve().parent / "project.json"' in launcher
        assert str(tmp_path) not in launcher
        assert f'{root}/{root}.exe' in archive.namelist()
        assert 'Extract the entire ZIP' in archive.read(f'{root}/README.txt').decode()
    assert builder.window.title == 'Chosen startup' and builder.imports == ['fractions']
    assert project.to_dict() == original


def test_event_validation_never_executes_source_and_retains_unmapped_drafts(tmp_path):
    project = buildable()
    project.event_code['clicked'] = 'raise RuntimeError("must not execute during build")\n'
    project.event_code['draft'] = 'def incomplete(\n'
    assert validate_project(project) == []
    result = export_project(project, tmp_path / 'app.zip', builder=StubBuilder())
    with zipfile.ZipFile(result) as archive:
        data = json.loads(archive.read('Demo-Project/_internal/project.json'))
        assert data['project']['event_code'] == project.event_code


@pytest.mark.parametrize('problem', ['no-windows', 'syntax', 'missing-import', 'relative-import'])
def test_invalid_builds_fail_before_touching_output(tmp_path, problem):
    project = buildable()
    if problem == 'no-windows':
        project = Project(windows=[])
    else:
        source = {'syntax': 'def broken(',
                  'missing-import': 'import viper_export_missing_dependency_12345\n',
                  'relative-import': 'from .helpers import value\n'}[problem]
        project.event_code['clicked'] = source
    destination = tmp_path / 'app.zip'
    destination.write_bytes(b'previous build')
    with pytest.raises(ValueError):
        export_project(project, destination, builder=StubBuilder(), overwrite=True)
    assert destination.read_bytes() == b'previous build'


@pytest.mark.parametrize('source', [None, '', ' \n    \n'])
def test_empty_change_mapping_does_not_block_export_or_modify_project(tmp_path, source):
    from viper.runtime import Runtime

    project = buildable()
    name = 'on_MainWindow_Launch_change'
    component = project.components[0]
    component.event_handlers['change'] = name
    if source is not None:
        project.event_code[name] = source
    original = project.to_dict()
    assert validate_project(project) == ['fractions']
    result = export_project(project, tmp_path / 'app.zip', builder=StubBuilder())
    with zipfile.ZipFile(result) as archive:
        saved = json.loads(archive.read('Demo-Project/_internal/project.json'))['project']
        assert saved == original
    replies = []
    Runtime(project).receive({'id': 1, 'command': 'event', 'payload': {
        'component_id': component.id, 'event': 'change'}}, replies.append)
    assert replies[-1]['result'] == {'handled': False, 'value': None}
    assert project.to_dict() == original


def test_external_registered_handler_cannot_silently_disappear_from_a_build():
    project = buildable()
    with pytest.raises(ValueError, match='registered outside the project'):
        validate_project(project, registered_handlers={'clicked': lambda event: None})


def test_build_failure_and_overwrite_guard_preserve_existing_archive(tmp_path):
    destination = tmp_path / 'app.zip'
    destination.write_bytes(b'previous build')

    class FailedBuilder(StubBuilder):
        def build(self, *args):
            raise RuntimeError('packager failed')

    with pytest.raises(FileExistsError):
        export_project(buildable(), destination, builder=StubBuilder())
    with pytest.raises(RuntimeError, match='packager failed'):
        export_project(buildable(), destination, builder=FailedBuilder(), overwrite=True)
    assert destination.read_bytes() == b'previous build'
    assert list(tmp_path.iterdir()) == [destination]
    with pytest.raises(ValueError, match='.zip'):
        export_project(buildable(), tmp_path / 'project.json', builder=StubBuilder())


def test_portable_filenames_and_default_zip_suffix(tmp_path):
    assert application_name('../CON') == 'App-CON'
    assert application_name('') == 'Application'
    assert '/' not in application_name('../one/two')
    assert export_project(buildable(), tmp_path / 'app', builder=StubBuilder()).suffix == '.zip'


def test_build_job_cancellation_snapshot_progress_and_duplicate_guard(monkeypatch, tmp_path):
    import viper.build
    import viper.hosts

    entered, release = threading.Event(), threading.Event()
    received = []
    destination = tmp_path / 'export.zip'

    def export(snapshot, path, **kwargs):
        received.append(snapshot.to_dict())
        kwargs['progress']('Working')
        entered.set()
        assert release.wait(5)
        return destination

    class Host:
        path = None
        def export_dialog(self, name, callback):
            callback(self.path)

    monkeypatch.setattr(viper.build, 'export_project', export)
    monkeypatch.setattr(viper.hosts, 'create_builder', StubBuilder)
    app = ViperApp(buildable())
    app.host = Host()
    replies = []
    app.bridge.receive({'id': 1, 'command': 'build'}, replies.append)
    assert replies[-1]['result'] == {'cancelled': True} and not entered.is_set()
    app.host.path = destination
    original = app.project.to_dict()
    app.bridge.receive({'id': 2, 'command': 'build'}, replies.append)
    job_id = replies[-1]['result']['job_id']
    try:
        assert entered.wait(5)
        app.project.name = 'Edited after starting'
        assert received == [original]
        app.bridge.receive({'id': 3, 'command': 'build'}, replies.append)
        assert 'already in progress' in replies[-1]['error']
        app.bridge.receive({'id': 4, 'command': 'build-status', 'payload': {'job_id': job_id}}, replies.append)
        assert replies[-1]['result']['state'] == 'running' and replies[-1]['result']['message'] == 'Working'
    finally:
        release.set()
    for _ in range(100):
        app.bridge.receive({'id': 5, 'command': 'build-status', 'payload': {'job_id': job_id}}, replies.append)
        if replies[-1]['result']['state'] == 'complete':
            break
        threading.Event().wait(.01)
    assert replies[-1]['result']['path'] == str(destination)
    app.bridge.receive({'id': 6, 'command': 'build-status', 'payload': {'job_id': 'unknown'}}, replies.append)
    assert 'Unknown application build' in replies[-1]['error']


def test_packaged_startup_errors_are_reported_without_a_console(monkeypatch, tmp_path):
    import viper.hosts
    from viper.packaged import launch

    errors = []
    monkeypatch.setattr(viper.hosts, 'show_launch_error', lambda *args: errors.append(args))
    monkeypatch.setattr('viper.packaged.tempfile.gettempdir', lambda: str(tmp_path))
    assert launch(tmp_path / 'missing.json') == 1
    assert errors and 'missing.json' in errors[0][1]
    assert 'FileNotFoundError' in (tmp_path / 'viper-application-error.log').read_text()


def test_python_archive_is_self_contained_and_runs_launcher_from_another_directory(monkeypatch, tmp_path):
    import viper.hosts
    monkeypatch.setattr(viper.hosts, 'create_builder', lambda: pytest.fail('Python export must not load PyInstaller'))
    project = buildable()
    second = WindowDefinition.from_dict({**project.get_window().to_dict(), 'form_id': 'second'})
    project.windows.append(second)
    project.startup_window_id = 'second'
    project.event_code['unused'] = 'def incomplete(\n'
    original = project.to_dict()
    destination = export_project(project, tmp_path / 'python.zip', format='python')
    with zipfile.ZipFile(destination) as archive:
        assert not any(name.endswith(('.exe', '.pyc')) for name in archive.namelist())
        assert not any(name.endswith('designer.html') for name in archive.namelist())
        archive.extractall(tmp_path / 'Moved project with spaces')
    root = tmp_path / 'Moved project with spaces' / 'Demo-Project'
    assert json.loads((root / 'project.json').read_text())['project'] == original
    assert 'pywebview' in (root / 'requirements.txt').read_text()
    assert 'PyInstaller' not in (root / 'requirements.txt').read_text()
    assert (root / 'viper' / 'runtime.py').read_bytes() == (Path(__file__).parents[1] / 'viper' / 'runtime.py').read_bytes()
    assert (root / 'viper' / 'assets' / 'components.js').is_file()
    script = ('import sys, runpy\nfrom pathlib import Path\n'
              f'root = Path({str(root)!r})\nsys.path.insert(0, str(root))\n'
              'import viper\nfrom viper.runtime import Runtime\n'
              'assert Path(viper.__file__).parent == root / "viper"\n'
              'def verify(runtime):\n'
              '    assert runtime.window_id == "second"\n'
              '    replies = []\n'
              '    runtime.receive({"id": 1, "command": "event", "payload": {"component_id": runtime.form.components[0].id, "event": "click"}}, replies.append)\n'
              '    assert replies[0]["result"]["updates"][0]["properties"]["text"] == "1/2"\n'
              '    print("bundled-runtime-ok")\n'
              'Runtime.launch = verify\nrunpy.run_path(str(root / "app.py"), run_name="__main__")\n')
    result = subprocess.run([sys.executable, '-I', '-c', script], cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0 and result.stdout.strip() == 'bundled-runtime-ok', result.stderr
    assert project.to_dict() == original


def test_python_requirements_include_static_third_party_imports():
    requirements = python_requirements(['fractions', 'pathlib', 'packaging.version', 'webview', 'viper.models'])
    assert f'packaging=={metadata.version("packaging")}' in requirements
    assert requirements.count('pywebview') == 1
    assert 'fractions==' not in requirements and 'viper==' not in requirements


def test_python_export_rejects_untracked_local_dependencies(monkeypatch):
    monkeypatch.setattr('viper.build.metadata.packages_distributions', lambda: {})
    with pytest.raises(ValueError, match='requirements.txt'):
        python_requirements(['local_helper'])


def test_unknown_export_format_preserves_existing_output(tmp_path):
    target = tmp_path / 'project.zip'
    target.write_bytes(b'previous')
    with pytest.raises(ValueError, match='export format'):
        export_project(buildable(), target, format='unknown', overwrite=True)
    assert target.read_bytes() == b'previous'


def test_python_build_job_needs_no_native_builder(monkeypatch, tmp_path):
    import viper.build
    import viper.hosts
    called = threading.Event()
    received = []

    def export(project, path, **kwargs):
        received.append(kwargs['format'])
        called.set()
        return tmp_path / 'app_python.zip'

    class Host:
        def export_dialog(self, name, callback):
            assert name.endswith('_python.zip')
            callback(tmp_path / name)

    monkeypatch.setattr(viper.hosts, 'create_builder', lambda: pytest.fail('Python build must not require a native packager'))
    monkeypatch.setattr(viper.build, 'export_project', export)
    app = ViperApp(buildable())
    app.host = Host()
    replies = []
    app.bridge.receive({'id': 1, 'command': 'build', 'payload': {'format': 'python'}}, replies.append)
    assert 'job_id' in replies[-1]['result']
    assert called.wait(5) and received == ['python']
