"""Self-closing WebView2 integration checks for the designer and runtime."""
import json
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from viper.app import ViperApp
from viper.hosts.windows import WindowsHost
from viper.runtime import Runtime
from viper.models import WindowDefinition
from test_window import icon_data

app, host, errors = ViperApp(), WindowsHost(), []
runtime_mode = '--runtime' in sys.argv
runtime_form = app.project
if runtime_mode and '--secondary' in sys.argv:
    runtime_form = WindowDefinition.from_dict({**app.project.to_dict(), 'form_id': 'secondary'})
    app.project.windows.append(runtime_form)
if runtime_mode:
    runtime_form.window.title = 'Form1'
    runtime_form.window.icon = icon_data()
    runtime_form.window.resizable = False
    component = runtime_form.components[0]
    component.event_handlers['click'] = 'runtime_click'
    app.project.event_code['runtime_click'] = 'def runtime_click(event):\n    return "native:" + event["window_id"]\n'
    component.box = {'x': 100, 'y': 100, 'width': 80, 'height': 32, 'reference_width': 960, 'reference_height': 640}
    runtime_form.links = [{'id': 'runtime-link', 'a': {'body': '$window', 'edge': 'right'},
        'b': {'body': component.id, 'edge': 'right'}, 'axis': 'both', 'distance_x': -.1, 'distance_y': -.2}]


def verify():
    try:
        for _ in range(200):
            if hasattr(host, '_window'):
                break
            threading.Event().wait(.1)
        assert host._window.events.loaded.wait(30), 'Native window did not load'
        ready, values = threading.Event(), []
        host._window.evaluate_js("viperHost.request('bootstrap')", lambda value: (values.append(value), ready.set()))
        assert ready.wait(15) and values[0]['project']['name'] == 'Demo Project'
        assert host._window.evaluate_js("document.querySelectorAll('.component').length") == 4
        cases = host._window.evaluate_js((Path(__file__).parent / 'anchor_cases.js').read_text(encoding='utf-8'))
        assert cases['passed'] == 10, cases
        if runtime_mode:
            assert host._window.title == 'Form1' and not host._window.resizable
            bitmap = host._window.native.Icon.ToBitmap()
            try:
                color = bitmap.GetPixel(16, 16)
                assert (color.R, color.G, color.B) == (64, 144, 255)
            finally:
                bitmap.Dispose()
            host._window.evaluate_js("document.querySelector('input.component').value = 'Edited'")
            host.resize(1100, 700)
            threading.Event().wait(.3)
            result = host._window.evaluate_js("""(() => {
              relativeLayout.update();
              const r = relativeLayout.rectangles.get(project.components[0].id);
              return {x: r.x, target: canvas.clientWidth * .9 - r.width, width: r.width,
                input: document.querySelector('input.component').value,
                menus: document.querySelectorAll('.component-size-menu').length};
            })()""")
            assert abs(result['x'] - result['target']) < .01 and result['width'] == 80, result
            assert result['input'] == 'Edited' and result['menus'] == 0, result
            event_ready, event_results = threading.Event(), []
            host._window.evaluate_js("""viperHost.request('event', {window_id: project.form_id,
                component_id: project.components[0].id, event: 'click', value: 'native'})""",
                lambda value: (event_results.append(value), event_ready.set()))
            assert event_ready.wait(15) and event_results[0] == {'handled': True, 'value': 'native:' + runtime_form.form_id}, event_results
            # The reply resolves before pywebview's API call acknowledgement;
            # let that acknowledgement drain before disposing its WebView.
            threading.Event().wait(.1)
        else:
            menu_ready, menu_results = threading.Event(), []
            host._window.evaluate_js((Path(__file__).parent / 'designer_menu_cases.js').read_text(encoding='utf-8'),
                                     lambda value: (menu_results.append(value), menu_ready.set()))
            assert menu_ready.wait(20), 'Menu checks did not finish'
            assert menu_results[0].get('passed', 0) == 50 and 'error' not in menu_results[0], menu_results
            tabs_ready, tabs_results = threading.Event(), []
            host._window.evaluate_js((Path(__file__).parent / 'designer_tab_cases.js').read_text(encoding='utf-8'),
                                    lambda value: (tabs_results.append(value), tabs_ready.set()))
            assert tabs_ready.wait(30), 'Form and event tab checks did not finish'
            assert tabs_results[0].get('passed', 0) == 25 and 'error' not in tabs_results[0], tabs_results
            workspace_ready, workspace_results = threading.Event(), []
            host._window.evaluate_js((Path(__file__).parent / 'designer_workspace_cases.js').read_text(encoding='utf-8'),
                                    lambda value: (workspace_results.append(value), workspace_ready.set()))
            assert workspace_ready.wait(30), 'Docking checks did not finish'
            assert workspace_results[0].get('passed', 0) == 45 and 'error' not in workspace_results[0], workspace_results
            for width, height in [(560, 430), (240, 260), (1280, 820)]:
                host.resize(width, height)
                threading.Event().wait(.2)
                shell = host._window.evaluate_js("""(() => {
                  const chrome = menus.chrome.getBoundingClientRect(), workspace = document.getElementById('workspace').getBoundingClientRect();
                  return {top: chrome.top, height: chrome.height, workspaceTop: workspace.top,
                    right: menus.buttons.at(-1).getBoundingClientRect().right, width: innerWidth,
                    pageHeight: document.documentElement.scrollHeight, heightAvailable: innerHeight};
                })()""")
                assert shell['top'] == 0 and shell['height'] == 68 and shell['workspaceTop'] == 68, shell
                assert shell['right'] <= shell['width'] and shell['pageHeight'] <= shell['heightAvailable'], shell
            assert host._window.evaluate_js("document.querySelectorAll('.component-size-menu').length") == 4
            result = host._window.evaluate_js("""(() => {
              const c = project.components[0]; selectedId = c.id; render();
              const wrapper = canvas.querySelector('.component-wrapper.selected');
              const anchors = wrapper.querySelectorAll('.position-anchor').length;
              wrapper.setPointerCapture = () => {}; wrapper.hasPointerCapture = () => false;
              const before = relativeLayout.rectangles.get(c.id);
              wrapper.querySelector('.resize-handle').dispatchEvent(new PointerEvent('pointerdown', {
                pointerId: 17, button: 0, clientX: 100, clientY: 100, bubbles: true}));
              wrapper.dispatchEvent(new PointerEvent('pointermove', {pointerId: 17,
                clientX: 100 + 40 * windowScale, clientY: 100 + 30 * windowScale, bubbles: true}));
              wrapper.dispatchEvent(new PointerEvent('pointerup', {pointerId: 17, bubbles: true}));
              const after = relativeLayout.rectangles.get(c.id);
              const resized = after.width > before.width && after.height > before.height;
              actions.execute('connect-links');
              document.querySelector('#container-anchors [data-anchor=left]').click();
              canvas.querySelector('.component-wrapper.selected [data-anchor=left]').click();
              actions.execute('connect-links');
              // Clear selection and use the visible line's actual click target.
              linkEditor.selected = null; linkEditor.inspect(); linkEditor.draw();
              const link = project.links[0], a = relativeLayout.anchor(link.a), b = relativeLayout.anchor(link.b);
              const rect = canvas.getBoundingClientRect();
              const hit = document.elementFromPoint(rect.left + (a.x + b.x) / 2 * windowScale,
                rect.top + (a.y + b.y) / 2 * windowScale);
              const hitTarget = hit && hit.classList.contains('link-hit');
              if (hit) hit.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
              const selected = linkEditor.selected === link.id;
              const scalar = document.getElementById('link-distance_x'); scalar.value = '.1'; scalar.dispatchEvent(new Event('change'));
              const oldWidth = relativeLayout.rectangles.get(c.id).width;
              const width = project.canvas_width; project.canvas_width *= 1.5; render();
              const fixed = relativeLayout.rectangles.get(c.id);
              const fixedX = fixed.x, fixedWidth = fixed.width;
              const menu = canvas.querySelector('.component-wrapper.selected .component-size-menu');
              menu.value = 'stretch'; menu.dispatchEvent(new Event('change', {bubbles: true}));
              const stretched = relativeLayout.rectangles.get(c.id);
              const stretchWidth = stretched.width;
              document.getElementById('preview').click();
              const noEditing = !canvas.querySelector('.component-wrapper, .component-size-menu');
              return {anchors, resized, hitTarget, selected, fixedX, target: project.canvas_width * .1,
                oldWidth, fixedWidth, stretchWidth, noEditing, windowAnchors: document.querySelectorAll('.container-anchor').length};
            })()""")
            assert result['anchors'] == 4 and result['windowAnchors'] == 4 and result['resized'], result
            assert result['hitTarget'] and result['selected'], result
            assert abs(result['fixedX'] - result['target']) < .01 and result['fixedWidth'] == result['oldWidth'], result
            assert abs(result['stretchWidth'] - result['oldWidth'] * 1.5) < .1 and result['noEditing'], result
            saved = threading.Event()
            host._window.evaluate_js("sync().then(() => viperHost.request('bootstrap'))", lambda value: (values.append(value), saved.set()))
            assert saved.wait(15) and len(values[-1]['project']['links']) == 1
            assert 'springs' not in values[-1]['project']
            host._window.evaluate_js("project = JSON.parse(JSON.stringify(project)); render()")
        print(json.dumps({'renderer': 'WebView2', 'mode': 'runtime' if runtime_mode else 'designer',
                          'form': runtime_form.form_id if runtime_mode else 'main',
                          'anchor_cases': cases['passed'], 'menu_checks': 0 if runtime_mode else menu_results[0]['passed'],
                          'tab_checks': 0 if runtime_mode else tabs_results[0]['passed'],
                          'workspace_checks': 0 if runtime_mode else workspace_results[0]['passed'],
                          'checks': 'passed'}))
    except Exception as exc:
        import traceback
        traceback.print_exc(); errors.append(exc)
    finally:
        if hasattr(host, '_window'):
            host.close()


threading.Thread(target=verify, daemon=True).start()
if runtime_mode:
    Runtime(app.project, window_id=runtime_form.form_id).launch(host)
else:
    app.launch(host)
if errors:
    raise SystemExit(1)
