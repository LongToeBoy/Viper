from copy import deepcopy
from pathlib import Path

import pytest

from viper.app import ViperApp
from viper.models import Project
from viper.serializer import load_project, save_project


class Host:
    def __init__(self):
        self.path = None
        self.dialogs = []
        self.titles = []
        self.pending = None
        self.defer = False

    def file_dialog(self, save, callback):
        self.dialogs.append(save)
        if self.defer:
            self.pending = callback
        else:
            callback(self.path)

    def set_title(self, title):
        self.titles.append(title)


def request(app, command, **payload):
    replies = []
    app.bridge.receive({'id': 1, 'command': command, 'payload': payload}, replies.append)
    assert replies and 'error' not in replies[0], replies
    return replies[0]['result']


def edit(app, name):
    project = deepcopy(app.project.to_dict())
    project['name'] = name
    request(app, 'update', project=project)


def test_first_save_remembers_destination_and_normal_save_never_opens_dialog(tmp_path):
    app = ViperApp()
    app.host = host = Host()
    host.path = tmp_path / 'My project'
    edit(app, 'My design')
    assert app.dirty and '*' in host.titles[-1]
    result = request(app, 'save')
    target = tmp_path / 'My project.json'
    assert result['saved'] and app.project_path == target.resolve() and not app.dirty
    assert 'My design [My project.json]' in host.titles[-1] and '*' not in host.titles[-1]
    edit(app, 'Revised design')
    request(app, 'save')
    assert host.dialogs == [True]
    assert load_project(target).name == 'Revised design'
    assert not app.dirty


def test_open_associates_existing_file_and_save_as_only_changes_path_on_success(tmp_path):
    original = save_project(Project(name='Opened'), tmp_path / 'original.json')
    app = ViperApp()
    app.host = host = Host()
    host.path = original
    assert request(app, 'open')['document']['path'] == str(original.resolve())
    edit(app, 'Changed')
    host.path = None
    assert request(app, 'save-as') == {'cancelled': True}
    assert app.project_path == original.resolve() and app.dirty
    request(app, 'save')
    assert host.dialogs == [False, True]
    assert load_project(original).name == 'Changed'
    host.path = tmp_path / 'copy.json'
    edit(app, 'Copy')
    request(app, 'save-as')
    assert app.project_path == host.path.resolve() and not app.dirty
    edit(app, 'Copy edit')
    request(app, 'save')
    assert len(host.dialogs) == 3
    assert load_project(original).name == 'Changed'
    assert load_project(host.path).name == 'Copy edit'


def test_programmatic_load_and_save_work_without_native_host(tmp_path):
    original = save_project(Project(name='Portable'), tmp_path / 'project.json')
    app = ViperApp()
    app.load(original)
    edit(app, 'Edited')
    request(app, 'save')
    assert load_project(original).name == 'Edited'
    assert 'path' not in app.project.to_dict() and 'dirty' not in app.project.to_dict()


def test_new_and_failed_open_leave_file_association_correct(tmp_path):
    original = save_project(Project(name='Keep me'), tmp_path / 'original.json')
    app = ViperApp()
    app.load(original)
    app.host = host = Host()
    broken = tmp_path / 'broken.json'
    broken.write_text('{', encoding='utf-8')
    host.path = broken
    replies = []
    app.bridge.receive({'id': 1, 'command': 'open'}, replies.append)
    assert 'error' in replies[0]
    assert app.project_path == original.resolve() and app.project.name == 'Keep me' and not app.dirty
    request(app, 'new')
    assert app.project_path is None and not app.dirty
    assert 'original.json' not in host.titles[-1]
    host.path = None
    assert request(app, 'save') == {'cancelled': True}


def test_dirty_compares_saved_content_including_code_styles_and_manual_reversal(tmp_path):
    app = ViperApp()
    app.save(tmp_path / 'project.json')
    app.project.components[0].style['font_size'] = 42
    assert app.dirty
    app.project.components[0].style['font_size'] = 14
    assert not app.dirty
    app.project.event_code['draft'] = '# exact unfinished source\ndef draft(\n'
    assert app.dirty
    app.save()
    saved = deepcopy(app.project.to_dict())
    edit(app, 'Edited')
    assert app.dirty
    request(app, 'update', project=saved)
    assert not app.dirty
    assert load_project(app.project_path).event_code['draft'] == saved['event_code']['draft']


def test_preview_geometry_initialization_and_no_op_updates_stay_clean():
    app = ViperApp()
    project = deepcopy(app.project.to_dict())
    component = project['windows'][0]['components'][0]
    component['box'] = {'x': 172.8, 'y': 115.2, 'width': 211.2, 'height': 76.8,
                        'reference_width': 960, 'reference_height': 640}
    request(app, 'update', project=project)
    assert not app.dirty
    assert not request(app, 'document-state')['dirty']


def test_save_failure_keeps_path_checkpoint_and_previous_file(tmp_path, monkeypatch):
    from viper import app as module
    app = ViperApp()
    original = app.save(tmp_path / 'original.json')
    before = original.read_bytes()
    edit(app, 'Must remain dirty')
    app.host = host = Host()
    host.path = tmp_path / 'copy.json'
    def fail(*args):
        raise OSError('disk full')
    monkeypatch.setattr(module, 'save_project', fail)
    replies = []
    app.bridge.receive({'id': 1, 'command': 'save-as'}, replies.append)
    assert replies[0]['error'] == 'disk full'
    assert app.project_path == original.resolve() and app.dirty
    assert original.read_bytes() == before


def test_edits_during_save_dialog_remain_dirty_and_save_captured_snapshot(tmp_path):
    app = ViperApp()
    app.host = host = Host()
    host.defer = True
    edit(app, 'Captured')
    replies = []
    app.bridge.receive({'id': 1, 'command': 'save'}, replies.append)
    edit(app, 'Newer edit')
    target = tmp_path / 'snapshot.json'
    host.pending(target)
    assert replies[0]['result']['document']['dirty']
    assert load_project(target).name == 'Captured'
    assert app.project.name == 'Newer edit' and app.project_path == target.resolve()


def test_old_save_dialog_cannot_associate_new_document(tmp_path):
    app = ViperApp()
    app.host = host = Host()
    host.defer = True
    replies = []
    app.bridge.receive({'id': 1, 'command': 'save'}, replies.append)
    request(app, 'new')
    host.pending(tmp_path / 'old.json')
    assert replies[0]['result']['saved']
    assert app.project_path is None and not app.dirty
    assert load_project(tmp_path / 'old.json').name == 'Demo Project'


def test_atomic_save_failure_preserves_previous_bytes_and_removes_temporary_file(tmp_path, monkeypatch):
    path = save_project(Project(name='Original'), tmp_path / 'project.json')
    before = path.read_bytes()
    def fail(*args):
        raise OSError('cannot replace destination')
    monkeypatch.setattr(Path, 'replace', fail)
    with pytest.raises(OSError, match='cannot replace'):
        save_project(Project(name='New'), path)
    assert path.read_bytes() == before
    assert list(tmp_path.glob('.viper-save-*.tmp')) == []
