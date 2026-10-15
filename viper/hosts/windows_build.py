"""Windows application packaging, using the same WebView2 runtime adapter."""
import importlib.util
import subprocess
import sys
from collections import deque
from pathlib import Path


class WindowsBuilder:
    def check_available(self):
        if getattr(sys, 'frozen', False):
            raise RuntimeError('Build applications from a Python installation of Viper with the build extra installed.')
        if importlib.util.find_spec('PyInstaller') is None:
            raise RuntimeError('Install PyInstaller in Viper\'s Python environment: python -m pip install "pyinstaller>=6.16,<7"')
        if importlib.util.find_spec('webview') is None:
            raise RuntimeError('Install the Windows runtime dependency before building: python -m pip install "pywebview>=6.2.1"')

    def build(self, staging, name, imports, window, report):
        command = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onedir', '--windowed', '--noupx',
                   '--name', name, '--distpath', str(staging / 'dist'), '--workpath', str(staging / 'work'),
                   '--specpath', str(staging), '--paths', str(Path(__file__).resolve().parents[2]),
                   '--add-data', f'{staging / "project.json"}:.',
                   '--add-data', f'{staging / "assets"}:viper/assets',
                   '--hidden-import', 'webview.platforms.winforms',
                   '--hidden-import', 'webview.platforms.edgechromium']
        for module in ['gi', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'cefpython3']:
            command.extend(['--exclude-module', module])
        for module in imports:
            command.extend(['--hidden-import', module])
        if window.icon:
            from .icons import write_icon
            command.extend(['--icon', str(write_icon(window.icon, staging, ico=True))])
        command.append(str(staging / 'launch.py'))
        report('Bundling Python, WebView2 host and application')
        tail = deque(maxlen=15)
        with subprocess.Popen(command, cwd=staging, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, encoding='utf-8', errors='replace',
                              creationflags=subprocess.CREATE_NO_WINDOW) as process:
            for line in process.stdout:
                tail.append(line.rstrip())
            if process.wait():
                raise RuntimeError('Application packaging failed:\n' + '\n'.join(tail))
        bundle = staging / 'dist' / name
        if not (bundle / f'{name}.exe').is_file():
            raise RuntimeError('The Windows packager did not produce an executable.')
        return bundle
