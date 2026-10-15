"""Native WebView2 checks for the actual shipped demo; optional screenshot.

python tests/windows_numpy_studio_smoke.py [--designer] [--screenshot path.png]
"""
import argparse
import base64
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from windows_export_smoke import CDP
from viper.app import ViperApp
from viper.hosts.windows import WindowsHost
from viper.runtime import Runtime
from viper.serializer import load_project


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--designer', action='store_true')
    parser.add_argument('--screenshot', type=Path)
    args = parser.parse_args()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = f'--remote-debugging-port={port}'
    project = load_project(Path(__file__).resolve().parents[1] / 'examples/numpy_studio/project.json')
    host, errors = WindowsHost(), []

    def verify():
        client = None
        try:
            deadline = time.monotonic() + 35
            while time.monotonic() < deadline:
                try:
                    with urlopen(f'http://127.0.0.1:{port}/json', timeout=1) as response:
                        target = next(item for item in json.load(response) if item['type'] == 'page')
                    client = CDP(target['webSocketDebuggerUrl'])
                    loaded = "typeof project !== 'undefined' && !!project && !!document.querySelector('iframe')" if args.designer else "typeof controlSession !== 'undefined' && !!controlSession"
                    if client.evaluate(loaded):
                        break
                    client.socket.close()
                    client = None
                except (OSError, StopIteration):
                    pass
                time.sleep(.1)
            assert client, 'Demo did not finish loading'
            if args.designer:
                client.evaluate("document.getElementById('preview').click()")
            session_name = 'previewSession' if args.designer else 'controlSession'
            ready = client.evaluate(f"!!{session_name} && !!{session_name}.nodes.get('Analyze')")
            assert ready, 'Demo controls did not render'
            result = client.evaluate('''(async () => {
                const node = id => controlSession.nodes.get(id);
                node('PresetOutlier').click(); await controlSession.pending;
                const outlier = node('MeanValue').textContent === '18.5' && node('InsightText').textContent.includes('1 potential outlier');
                node('Standardize').querySelector('input').click(); await controlSession.pending;
                const normalized = node('MeanValue').textContent === '0' && node('SpreadValue').textContent === '1';
                node('Standardize').querySelector('input').click(); await controlSession.pending;
                node('DataInput').value = 'oops'; node('Analyze').click(); await controlSession.pending;
                const invalid = !node('ErrorMessage').hidden && node('MeanValue').textContent === '18.5';
                node('PresetSales').click(); await controlSession.pending;
                const recovered = node('ErrorMessage').hidden && node('CountValue').textContent === '24';
                const histogram = Array.from({length:8}, (_, i) => Number(node('Frequency' + i).textContent)).reduce((a,b)=>a+b,0) === 24;
                const root = node('Analyze').ownerDocument;
                const styled = root.defaultView.getComputedStyle(node('Sidebar')).backgroundColor === 'rgb(18, 46, 40)' &&
                    root.defaultView.getComputedStyle(node('Analyze')).backgroundColor === 'rgb(8, 127, 112)';
                const layout = ViperAnchorLayout.solve(project, 1120, 820);
                const bounds = [...layout.values()].every(r => r.x >= -.1 && r.y >= -.1 && r.x + r.width <= 1120.1 && r.y + r.height <= 820.1);
                return {outlier, normalized, invalid, recovered, histogram, styled, bounds};
            })()'''.replace('controlSession', session_name))
            assert all(result.values()), result
            if args.screenshot:
                # The screenshot is of the genuine application canvas.
                time.sleep(.2)
                screenshot = client.command('Page.captureScreenshot', format='png')
                args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                args.screenshot.write_bytes(base64.b64decode(screenshot['data']))
            host.resize(1350, 980)
            time.sleep(.3)
            assert client.evaluate(f"{session_name}.nodes.get('CountValue').textContent === '24'")
            print(json.dumps({'mode': 'designer-preview' if args.designer else 'runtime', 'checks': result, 'resize': True}))
        except Exception as error:
            import traceback
            traceback.print_exc()
            errors.append(error)
        finally:
            if client:
                client.socket.close()
            if hasattr(host, '_window'):
                host.close()

    threading.Thread(target=verify, daemon=True).start()
    if args.designer:
        ViperApp(project).launch(host)
    else:
        Runtime(project).launch(host)
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
