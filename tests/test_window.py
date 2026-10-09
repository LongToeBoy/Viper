import base64
import struct
import zlib

from viper.app import ViperApp
from viper.hosts.icons import write_icon
from viper.models import Project, WindowSettings
from viper.runtime import Runtime
from viper.serializer import deserialize_project, serialize_project


def icon_data():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 32, 32, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress((b'\x00' + b'\x40\x90\xff\xff' * 32) * 32)) + chunk(b'IEND', b'')
    return 'data:image/png;base64,' + base64.b64encode(png).decode()


def test_window_settings_round_trip_and_legacy_defaults():
    project = Project(name='Example', window=WindowSettings(title='Form1', icon=icon_data(),
        decorated=False, resizable=False, min_width=300, min_height=200, state='maximized'))
    restored = deserialize_project(serialize_project(project))
    assert restored.window == project.window
    legacy = Project.from_dict({'name': 'Old project', 'canvas_width': 640, 'canvas_height': 480})
    assert legacy.window.title == 'Old project'
    assert legacy.window.resizable and legacy.window.decorated


def test_runtime_applies_window_properties_without_changing_ide():
    app = ViperApp()
    app.project.window.title = 'Form1'
    app.project.window.icon = icon_data()
    app.project.window.resizable = False
    app.project.window.decorated = False
    app.project.window.state = 'fullscreen'

    class Host:
        def run(self, interface, receiver, options):
            self.options = options

    host = Host()
    Runtime(app.project).launch(host)
    assert host.options.title == 'Form1'
    assert host.options.icon_data == app.project.window.icon
    assert not host.options.resizable and not host.options.decorated
    assert host.options.state == 'fullscreen'
    app.launch(host)
    assert host.options.title == 'Viper Designer'
    assert host.options.resizable and host.options.decorated


def test_embedded_icon_native_formats(tmp_path):
    png = write_icon(icon_data(), tmp_path, ico=False)
    ico = write_icon(icon_data(), tmp_path, ico=True)
    assert png.read_bytes().startswith(b'\x89PNG')
    assert ico.read_bytes()[:6] == struct.pack('<HHH', 0, 1, 1)
    assert ico.read_bytes()[22:] == png.read_bytes()
