"""Build, relocate, and drive a real frozen application over local WebView2 CDP.

The debug port is enabled only in this test process's child environment.
No debug endpoint or smoke-test mode is built into exported applications.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import threading
from urllib.parse import urlsplit
from urllib.request import urlopen
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class CDP:
    def __init__(self, url):
        target = urlsplit(url)
        self.socket = socket.create_connection((target.hostname, target.port), timeout=30)
        self.buffer, self.sequence = b'', 0
        key = base64.b64encode(os.urandom(16)).decode()
        self.socket.sendall((f'GET {target.path} HTTP/1.1\r\nHost: {target.netloc}\r\n'
            f'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n'
            'Sec-WebSocket-Version: 13\r\n\r\n').encode())
        while b'\r\n\r\n' not in self.buffer:
            self.buffer += self.socket.recv(4096)
        headers, self.buffer = self.buffer.split(b'\r\n\r\n', 1)
        assert headers.split(b'\r\n', 1)[0].split()[1] == b'101', headers

    def read(self, length):
        while len(self.buffer) < length:
            chunk = self.socket.recv(max(4096, length - len(self.buffer)))
            if not chunk:
                raise ConnectionError('WebView2 closed its debug connection')
            self.buffer += chunk
        data, self.buffer = self.buffer[:length], self.buffer[length:]
        return data

    def send(self, data, opcode=1):
        mask = os.urandom(4)
        length = len(data)
        header = bytes([0x80 | opcode, 0x80 | length]) if length < 126 else (
            bytes([0x80 | opcode, 0xfe]) + struct.pack('!H', length))
        self.socket.sendall(header + mask + bytes(byte ^ mask[i % 4] for i, byte in enumerate(data)))

    def receive(self):
        message = b''
        while True:
            flags, length = self.read(2)
            opcode, masked = flags & 15, length & 128
            length &= 127
            if length == 126:
                length = struct.unpack('!H', self.read(2))[0]
            elif length == 127:
                length = struct.unpack('!Q', self.read(8))[0]
            mask = self.read(4) if masked else None
            payload = self.read(length)
            if mask:
                payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
            if opcode == 8:
                raise ConnectionError('WebView2 closed its debug connection')
            if opcode == 9:
                self.send(payload, 10)
                continue
            message += payload
            if flags & 128:
                return json.loads(message)

    def evaluate(self, expression, retries=20):
        self.sequence += 1
        self.send(json.dumps({'id': self.sequence, 'method': 'Runtime.evaluate', 'params': {
            'expression': expression, 'awaitPromise': True, 'returnByValue': True}}).encode())
        while True:
            message = self.receive()
            if message.get('id') != self.sequence:
                continue
            if retries and message.get('error', {}).get('message') == 'Execution context was destroyed.':
                threading.Event().wait(.1)
                return self.evaluate(expression, retries - 1)
            assert 'error' not in message, message
            assert 'exceptionDetails' not in message['result'], message
            return message['result']['result'].get('value')

    def command(self, method, **params):
        self.sequence += 1
        self.send(json.dumps({'id':self.sequence, 'method':method, 'params':params}).encode())
        while True:
            message = self.receive()
            if message.get('id') == self.sequence:
                assert 'error' not in message, message
                return message['result']


def check_button_focus(client):
    # Real CDP input changes Chromium's focus modality; synthetic DOM events do not.
    # Keep keyboard tests independent of other native smoke windows or user focus.
    client.command('Emulation.setFocusEmulationEnabled', enabled=True)
    target = client.evaluate('''(() => {
      const button = controlSession.nodes.get(project.components.find(c => c.type === 'button').id);
      button.style.removeProperty('background-color');
      const box = button.getBoundingClientRect(), frame = surface.frame?.getBoundingClientRect();
      return {x:box.x + box.width / 2 + (frame?.x || 0), y:box.y + box.height / 2 + (frame?.y || 0)};
    })()''')
    state = '''(() => {
      const button = controlSession.nodes.get(project.components.find(c => c.type === 'button').id);
      return {color:getComputedStyle(button).backgroundColor, focus:button.ownerDocument.activeElement === button,
        documentFocus:button.ownerDocument.hasFocus(),
        keyboard:button.matches(':focus-visible'), hover:button.matches(':hover')};
    })()'''
    client.command('Input.dispatchMouseEvent', type='mouseMoved', x=2, y=2)
    before = client.evaluate(state)
    client.command('Input.dispatchMouseEvent', type='mouseMoved', **target)
    hover = client.evaluate(state)
    assert hover['color'] == 'rgb(96, 108, 118)' and hover['hover'], hover
    client.command('Input.dispatchMouseEvent', type='mousePressed', button='left', clickCount=1, **target)
    client.command('Input.dispatchMouseEvent', type='mouseReleased', button='left', clickCount=1, **target)
    client.command('Input.dispatchMouseEvent', type='mouseMoved', x=2, y=2)
    after = client.evaluate(state)
    assert after['focus'] and not after['hover'] and not after['keyboard'], after
    assert after['color'] == before['color'] == 'rgb(155, 77, 202)', {'before':before, 'after':after}
    # Keep focus and change to keyboard modality, then activate the same handler.
    client.command('Input.dispatchKeyEvent', type='keyDown', key='Tab', code='Tab', windowsVirtualKeyCode=9, modifiers=8)
    client.command('Input.dispatchKeyEvent', type='keyUp', key='Tab', code='Tab', windowsVirtualKeyCode=9, modifiers=8)
    client.command('Input.dispatchKeyEvent', type='keyDown', key='Tab', code='Tab', windowsVirtualKeyCode=9)
    client.command('Input.dispatchKeyEvent', type='keyUp', key='Tab', code='Tab', windowsVirtualKeyCode=9)
    keyboard = client.evaluate(state)
    assert keyboard['focus'] and keyboard['keyboard'] and keyboard['color'] == hover['color'], keyboard
    client.command('Input.dispatchKeyEvent', type='keyDown', key='Enter', code='Enter', windowsVirtualKeyCode=13)
    client.command('Input.dispatchKeyEvent', type='keyUp', key='Enter', code='Enter', windowsVirtualKeyCode=13)
    label = client.evaluate('''(async () => {
      await controlSession.pending;
      return controlSession.nodes.get(project.components.find(c => c.name === 'StatusLabel').id).textContent;
    })()''')
    assert label == 'Packaged 1/2', label
    return {'pointer_focus_restored':True, 'keyboard_focus_visible':True, 'keyboard_events':True}


def make_demo(archive, format, theme_id=None):
    from viper.app import ViperApp
    from viper.build import export_project
    from viper.models import WindowDefinition
    from test_window import icon_data

    project = ViperApp.create_demo_project()
    project.name = 'Viper Export Demo'
    second = WindowDefinition.from_dict({**project.get_window().to_dict(), 'form_id': 'export-startup'})
    second.window.title = 'Viper Export Demo'
    second.window.icon = icon_data()
    project.windows.append(second)
    project.startup_window_id = second.form_id
    second.components[0].event_handlers['click'] = 'clicked'
    second.components[0].event_handlers['change'] = 'on_MainWindow_Launch_change'
    second.components[1].event_handlers['change'] = 'changed'
    project.event_code = {
        'clicked': 'def clicked(event):\n    StatusLabel.Text = "Packaged " + str(Fraction(1, 2))\n',
        'changed': 'def changed(event):\n    MainPanel.Text = "Label change handler ran"\n',
        'unused_draft': 'def unfinished(\n',
    }
    second.imports = '# Window dependency, shared by its handlers.\nfrom fractions import Fraction\n'
    if theme_id:
        from viper.themes import ThemeLibrary
        theme = ThemeLibrary().get(theme_id)
        project.themes = {theme_id: {key:theme[key] for key in ('name', 'css')}}
        project.active_theme = theme_id
        second.window.background_theme_color = 'primary'
        second.window.use_theme_background = False
        second.components[0].style_overrides['background_color'] = 'var(--viper-color-primary, #2563eb)'
    export_project(project, archive, format=format, overwrite=True, progress=lambda message: print(message, flush=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--format', choices=['exe', 'python'], default='exe')
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--theme', choices=['bootstrap.css', 'milligram.css'])
    parser.add_argument('--check-focus', action='store_true', help='Exercise Milligram pointer and keyboard focus using real CDP input')
    args = parser.parse_args()
    default_archive = 'dist/Viper-Export-Demo-Python.zip' if args.format == 'python' else 'dist/Viper-Export-Demo.zip'
    archive_path = (args.archive or Path(default_archive)).resolve()
    if args.build:
        make_demo(archive_path, args.format, args.theme)
    with tempfile.TemporaryDirectory(prefix='viper-export-test-') as directory:
        temporary = Path(directory)
        moved = temporary / 'Recipient folder with spaces'
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(moved)
        candidates = moved.rglob('app.py' if args.format == 'python' else '*.exe')
        executable, = (path for path in candidates if args.format != 'python' or (path.parent / 'project.json').is_file())
        project_path = executable.parent / ('project.json' if args.format == 'python' else '_internal/project.json')
        snapshot = json.loads(project_path.read_text())['project']
        elsewhere = temporary / 'Unrelated working directory'
        elsewhere.mkdir()
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        environment = dict(os.environ)
        environment.pop('PYTHONHOME', None)
        environment.pop('PYTHONPATH', None)
        environment['PATH'] = str(Path(environment.get('SYSTEMROOT') or environment['SystemRoot']) / 'System32')
        environment['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = f'--remote-debugging-port={port}'
        client = None
        command = [sys.executable, str(executable)] if args.format == 'python' else [str(executable)]
        process = subprocess.Popen(command, cwd=elsewhere, env=environment,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            target = None
            for _ in range(300):
                if process.poll() is not None:
                    raise AssertionError(f'Packaged application exited with {process.returncode}')
                try:
                    with urlopen(f'http://127.0.0.1:{port}/json', timeout=1) as response:
                        target = next((item for item in json.load(response) if item['type'] == 'page'), None)
                    if target:
                        break
                except OSError:
                    pass
                threading.Event().wait(.1)
            assert target, 'Packaged WebView2 did not expose a page within 30 seconds'
            client = CDP(target['webSocketDebuggerUrl'])
            result = client.evaluate('''(async () => {
              for (let i = 0; i < 300 && (typeof controlSession === 'undefined' || !controlSession); i++)
                await new Promise(resolve => setTimeout(resolve, 50));
              const byName = name => controlSession.nodes.get(project.components.find(c => c.name === name).id);
              byName('NameInput').value = 'Recipient typing';
              byName('Launch').click(); await controlSession.pending;
              byName('Launch').dispatchEvent(new Event('change')); await controlSession.pending;
              relativeLayout.update();
              return {form: project.form_id, title: project.window.title,
                controls: surface.root.querySelectorAll('.component').length,
                themed: surface.themed, buttonColor: getComputedStyle(byName('Launch')).backgroundColor,
                backgroundColor: getComputedStyle(surface.themed ? surface.root.ownerDocument.body : canvas).backgroundColor,
                buttonClass: byName('Launch').classList.contains('btn'),
                label: byName('StatusLabel').textContent, panel: byName('MainPanel').textContent,
                input: byName('NameInput').value, menus: !!document.getElementById('application-chrome')};
            })()''')
            assert result['form'] == snapshot['startup_window_id'], result
            assert result['controls'] == 4 and result['menus'] is False, result
            assert result['label'] == 'Packaged 1/2' and result['panel'] == 'Label change handler ran', result
            assert result['input'] == 'Recipient typing', result
            focus = check_button_focus(client) if args.check_focus else None
            if args.theme:
                assert result['themed'] and result['buttonClass'], result
                assert result['buttonColor'] == ('rgb(13, 110, 253)' if args.theme == 'bootstrap.css' else 'rgb(155, 77, 202)'), result
                assert result['backgroundColor'] == result['buttonColor'], result
                assert (project_path.parent / 'themes' / args.theme).is_file()
            runtime_root = executable.parent / ('viper' if args.format == 'python' else '_internal/viper')
            assert not (runtime_root / 'assets' / 'designer.html').exists()
            print(json.dumps({'archive': str(archive_path), 'format': args.format, 'relocated': True, 'python_on_path': False,
                              'renderer': 'WebView2', 'startup': result['form'], 'theme':args.theme, 'focus':focus, 'checks': 'passed'}))
        finally:
            if client:
                client.socket.close()
            if process.poll() is None:
                process.terminate()
            process.wait(timeout=15)


if __name__ == '__main__':
    main()
