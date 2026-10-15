"""Real WebView2 pointer input catches click retargeting hidden by element.click()."""
import json


def check_docking_pointer(client):
    original = client.evaluate('panels.snapshot()')
    project = client.evaluate('JSON.stringify(projectRoot)')
    passed = 0

    def check(expression, message):
        nonlocal passed
        result = client.evaluate(expression)
        assert result, {'message':message, 'workspace':client.evaluate('panels.snapshot()'),
                        'gesture':client.evaluate('panels.gesture'), 'targets':client.evaluate('panels.targets.hidden')}
        passed += 1

    def point(tool):
        return client.evaluate(f'''(() => {{
          const tab = panels.groupNodes.get(panels.groupFor({json.dumps(tool)}).id).querySelector('[data-tool="{tool}"]');
          const rect = tab.getBoundingClientRect();
          return {{x:rect.x + rect.width / 2, y:rect.y + rect.height / 2}};
        }})()''')

    def mouse(kind, position, **params):
        client.command('Input.dispatchMouseEvent', type=kind, **position, **params)

    def click(tool, jitter=False):
        position = point(tool)
        mouse('mouseMoved', position)
        mouse('mousePressed', position, button='left', clickCount=1)
        if jitter:
            position = {key:value + 1 for key, value in position.items()}
            mouse('mouseMoved', position, buttons=1)
        mouse('mouseReleased', position, button='left', clickCount=1)

    def drag(tool, side):
        position = point(tool)
        mouse('mouseMoved', position)
        mouse('mousePressed', position, button='left', clickCount=1)
        mouse('mouseMoved', {'x':position['x'] + 12, 'y':position['y'] + 12}, buttons=1)
        check('!panels.targets.hidden', 'Moving far enough must expose docking targets')
        destination = client.evaluate(f'''(() => {{
          const rect = panels.dropTargets.find(target => target.destination.location === {json.dumps(side)}).node.getBoundingClientRect();
          return {{x:rect.x + rect.width / 2, y:rect.y + rect.height / 2}};
        }})()''')
        mouse('mouseMoved', destination, buttons=1)
        mouse('mouseReleased', destination, button='left', clickCount=1)

    try:
        client.command('Emulation.setFocusEmulationEnabled', enabled=True)
        client.evaluate('panels.reset()')
        click('components')
        check("panels.isActive('components') && !document.getElementById('components-tool').hidden && document.getElementById('project-tool').hidden",
              'One real mouse click must switch the docked tool')
        click('project')
        check("panels.isActive('project') && panels.groupFor('project').location === 'left'", 'Click must switch back without detaching the tool')
        click('components', jitter=True)
        check("panels.isActive('components') && panels.groupFor('components') === panels.groupFor('project') && !panels.gesture && panels.targets.hidden",
              'Small mouse movement must still count as a click')
        click('components')
        check("panels.isActive('components') && panels.state.groups.length === 2", 'Clicking the active tab must preserve its dock')
        client.evaluate("document.getElementById('tool-tab-components').focus()")
        client.command('Input.dispatchKeyEvent', type='keyDown', key='ArrowLeft', code='ArrowLeft', windowsVirtualKeyCode=37)
        client.command('Input.dispatchKeyEvent', type='keyUp', key='ArrowLeft', code='ArrowLeft', windowsVirtualKeyCode=37)
        check("panels.isActive('project') && document.activeElement.dataset.tool === 'project'", 'Keyboard switching must retain focus on the new tab')
        drag('project', 'right')
        check("panels.groupFor('project') === panels.groupFor('inspector') && panels.groupFor('project').location === 'right' && panels.isActive('project')",
              'Dragging a tab must still move only that tool into an occupied dock')
        click('inspector')
        check("panels.isActive('inspector') && document.getElementById('project-tool').hidden", 'Docked clicks must work after dragging')
        client.evaluate("panels.float('project'); panels.moveTools(['inspector'], {groupId:panels.groupFor('project').id}); panels.commit()")
        click('project')
        check("panels.isActive('project') && panels.groupFor('project').location === 'floating'", 'Floating tool tabs must switch on one click')
        click('inspector', jitter=True)
        check("panels.isActive('inspector') && panels.groupFor('inspector') === panels.groupFor('project')", 'Floating tabs must tolerate click jitter')
        drag('inspector', 'left')
        check("panels.groupFor('inspector') === panels.groupFor('components') && panels.groupFor('project').location === 'floating'",
              'A floating tab must still detach and dock independently')
        click('components')
        check("panels.isActive('components') && !panels.gesture && panels.targets.hidden", 'Click switching must continue after a second drag')
        client.evaluate("panels.dock('project', 'left')")
        check('''(() => {
          const strip = document.getElementById('tool-tab-project').parentElement;
          const visibleBottom = strip.getBoundingClientRect().top + strip.clientTop + strip.clientHeight;
          return strip.children.length === 3 && strip.scrollWidth > strip.clientWidth && [...strip.children].every(tab => {
            const text = document.createRange(); text.selectNodeContents(tab);
            return text.getBoundingClientRect().bottom <= visibleBottom + .5;
          });
        })()''', 'All three docked tab labels must fit above the horizontal scrollbar')
        check(f'JSON.stringify(projectRoot) === {json.dumps(project)}', 'Tool clicks and drags must preserve project data')
        return {'passed':passed}
    finally:
        client.evaluate(f'panels.restore({json.dumps(original)})')
