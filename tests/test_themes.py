import json
from pathlib import Path
import zipfile

import pytest

from viper.app import ViperApp
from viper.build import export_project
from viper.models import Component, Project
from viper.serializer import load_project, save_project
from viper.themes import ThemeLibrary, portable_css


def test_themes_and_appearance_round_trip_without_changing_names_or_event_source(tmp_path):
    project = ViperApp.create_demo_project()
    project.themes = {'example.css': {'name': 'Example', 'css': '.btn {color:red} body {background:white}'}}
    project.active_theme = 'example.css'
    project.components[0].style_overrides = {'font_size': 23, 'text_color': '#123456', 'white_space': 'normal'}
    project.event_code['click'] = '# Do not rewrite me.\ndef click(event):\n    StatusLabel.Text="Hi"\n'
    original = project.to_dict()
    save_project(project, tmp_path / 'project.json')
    assert load_project(tmp_path / 'project.json').to_dict() == original
    legacy = {key: value for key, value in original.items() if key not in {'themes', 'active_theme'}}
    assert Project.from_dict(legacy).active_theme is None


@pytest.mark.parametrize('key,value', [('font_size', float('nan')), ('padding', True), ('border_width', -1),
                                     ('position', 'fixed'), ('overflow', 'crop')])
def test_invalid_style_overrides_are_rejected(key, value):
    with pytest.raises(ValueError):
        Component(id='test', name='Button1', type='button', style_overrides={key: value})


@pytest.mark.parametrize('filename', ['../outside.css', '/outside.css', 'x\\outside.css', 'outside.py'])
def test_theme_filenames_cannot_escape_library_or_export(filename):
    with pytest.raises(ValueError):
        Project(themes={filename: {'css': ''}})


def test_missing_active_theme_is_rejected():
    with pytest.raises(ValueError, match='Active theme'):
        Project(active_theme='missing.css')


def test_runtime_bootstrap_uses_the_same_theme_for_each_window():
    from viper.models import WindowDefinition
    from viper.runtime import Runtime
    project = ViperApp.create_demo_project()
    project.windows.append(WindowDefinition(form_id='second'))
    project.themes = {'theme.css': {'name': 'Theme', 'css': '.btn {color:red}'}}
    project.active_theme = 'theme.css'
    for form in project.windows:
        replies = []
        Runtime(project, window_id=form.form_id).receive({'id':1, 'command':'bootstrap'}, replies.append)
        assert replies[0]['result']['theme'] == project.themes['theme.css']
        assert replies[0]['result']['project']['form_id'] == form.form_id


def test_theme_palette_color_references_round_trip_and_remain_native_safe(tmp_path):
    from viper.models import WindowSettings
    project = ViperApp.create_demo_project()
    project.window.background_theme_color = 'primary'
    project.window.background_color = '#0d6efd'
    project.window.use_theme_background = False
    project.components[0].style_overrides = {'background_color':'var(--viper-color-primary, #2563eb)'}
    save_project(project, tmp_path / 'palette.json')
    restored = load_project(tmp_path / 'palette.json')
    assert restored.to_dict() == project.to_dict()
    assert restored.window.background_color == '#0d6efd'
    assert WindowSettings.from_dict({}).background_theme_color == ''
    with pytest.raises(ValueError, match='theme color'):
        WindowSettings.from_dict({'background_theme_color':'../primary'})


def test_css_imports_and_images_are_embedded_and_keep_media_spacing(tmp_path):
    (tmp_path / 'images').mkdir()
    (tmp_path / 'images' / 'picture.png').write_bytes(b'image-example')
    (tmp_path / 'base.css').write_text('.btn { background-image:url("images/picture.png"); }', encoding='utf-8')
    source = tmp_path / 'main.css'
    source.write_text('@import "base.css" screen and (min-width: 200px);\ninput{color:red}', encoding='utf-8')
    css = portable_css(source)
    assert '@media screen and (min-width: 200px)' in css
    assert 'data:image/png;base64,aW1hZ2UtZXhhbXBsZQ==' in css
    assert 'images/picture.png' not in css and 'base.css' not in css
    library = ThemeLibrary(tmp_path / 'library')
    first = library.import_file(source)
    assert library.get(first['id']) == first
    assert library.import_file(source)['id'] == first['id']
    source.write_text('button {color:blue}', encoding='utf-8')
    assert library.import_file(source)['id'] != first['id']
    assert library.get(first['id'])['css'] == css


@pytest.mark.parametrize('css', ['@import "cycle.css";', 'button {background:url(https://example.com/image.png)}',
                               '@import "https://example.com/theme.css";', 'button {background:url(secret.json)}'])
def test_unportable_or_cyclic_css_fails_before_copy(tmp_path, css):
    path = tmp_path / 'cycle.css'
    path.write_text(css, encoding='utf-8')
    with pytest.raises(ValueError):
        ThemeLibrary(tmp_path / 'library').import_file(path)
    assert not (tmp_path / 'library').exists()


def test_builtin_frameworks_and_bridge_theme_commands():
    app = ViperApp()
    replies = []
    def request(command, payload=None):
        app.bridge.receive({'id': 1, 'command': command, 'payload': payload}, replies.append)
        assert 'error' not in replies[-1], replies[-1]
        return replies[-1]['result']
    assert {'bootstrap.css', 'milligram.css'} <= {theme['id'] for theme in request('theme-list')['themes']}
    assert '.btn' in request('theme-load', {'id': 'bootstrap.css'})['css']
    assert 'MIT License' in request('theme-load', {'id': 'milligram.css'})['css']
    assert app.project.active_theme is None


def test_import_dialog_cancellation_errors_and_success(tmp_path):
    source = tmp_path / 'custom.css'
    source.write_text('.btn {color:purple}', encoding='utf-8')
    class Host:
        path = None
        def theme_dialog(self, callback):
            callback(self.path)
    app = ViperApp()
    app.host = Host()
    app.bridge.themes = ThemeLibrary(tmp_path / 'library')
    replies = []
    message = {'id': 1, 'command': 'theme-import'}
    app.bridge.receive(message, replies.append)
    assert replies[-1]['result']['cancelled']
    app.host.path = source
    app.bridge.receive(message, replies.append)
    assert replies[-1]['result']['id'] == 'custom.css'
    app.host.path = tmp_path / 'missing.css'
    app.bridge.receive(message, replies.append)
    assert 'error' in replies[-1]


def test_python_export_contains_portable_theme_and_launch_uses_edited_css(monkeypatch, tmp_path):
    from viper.packaged import launch
    project = ViperApp.create_demo_project()
    theme = ThemeLibrary().get('milligram.css')
    project.themes = {theme['id']: {key:theme[key] for key in ('name', 'css')}}
    project.active_theme = theme['id']
    original = project.to_dict()
    archive_path = export_project(project, tmp_path / 'app.zip', format='python')
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.read('Demo-Project/themes/milligram.css').decode() == theme['css']
        assert json.loads(archive.read('Demo-Project/project.json'))['project'] == original
        archive.extractall(tmp_path / 'relocated')
    folder = tmp_path / 'relocated' / 'Demo-Project'
    (folder / 'themes' / 'milligram.css').write_text('button{color:green}', encoding='utf-8')
    launched = []
    monkeypatch.setattr('viper.runtime.Runtime.launch', lambda runtime: launched.append(runtime.project))
    assert launch(folder / 'project.json') == 0
    assert launched[0].themes[theme['id']]['css'] == 'button{color:green}'
    assert project.to_dict() == original
