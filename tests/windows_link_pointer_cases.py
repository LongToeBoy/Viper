"""Real mouse and keyboard regression checks for selecting/deleting anchor links."""
import json


def check_link_pointer(client):
    original = client.evaluate('clone(projectRoot)')
    workspace = client.evaluate('panels.snapshot()')
    preferences = client.evaluate('({...preferences.values})')
    passed = 0

    def check(expression, message):
        nonlocal passed
        assert client.evaluate(expression), {'message': message, 'themed': themed, 'status': client.evaluate('status.textContent')}
        passed += 1

    def click(expression):
        position = client.evaluate(f'''(() => {{
          const node = ({expression}), box = node.getBoundingClientRect();
          const x = box.x + box.width / 2, y = box.y + box.height / 2;
          if (node.ownerDocument !== document) {{
            const frame = surface.frame.getBoundingClientRect();
            return {{x:frame.x + x*windowScale,y:frame.y + y*windowScale}};
          }}
          return {{x,y}};
        }})()''')
        client.command('Input.dispatchMouseEvent', type='mouseMoved', **position)
        client.command('Input.dispatchMouseEvent', type='mousePressed', button='left', clickCount=1, **position)
        client.command('Input.dispatchMouseEvent', type='mouseReleased', button='left', clickCount=1, **position)

    def key(name, code):
        client.command('Input.dispatchKeyEvent', type='keyDown', key=name, code=name, windowsVirtualKeyCode=code)
        client.command('Input.dispatchKeyEvent', type='keyUp', key=name, code=name, windowsVirtualKeyCode=code)

    try:
        client.command('Emulation.setFocusEmulationEnabled', enabled=True)
        for themed in (False, True):
            client.evaluate(f'''(() => {{
              replaceProject({json.dumps(original)}); panels.reset();
              preferences.set('showAnchors', true); applyPreferences();
              projectRoot.active_theme = {'"bootstrap.css"' if themed else 'null'};
              const c = project.components[0];
              c.box = {{x:240,y:160,width:150,height:64,reference_width:960,reference_height:640}};
              c.size_mode = 'fixed'; project.links = []; selectComponent(c.id); render();
              actions.execute('connect-links');
            }})()''')
            # The existing theme library is supplied through the normal bridge.
            if themed:
                client.evaluate('''(async () => {
                  const theme = await viperHost.request('theme-load', {id:'bootstrap.css'});
                  projectRoot.themes['bootstrap.css'] = theme;
                  render();
                })()''')
            click("document.querySelector('#container-anchors [data-anchor=left]')")
            click("surface.root.querySelector('.component-wrapper.selected [data-anchor=left]')")
            check('project.links.length === 1', 'Real anchor clicks must create one link')
            check('!linkEditor.connecting && !linkEditor.pending', 'Creating a link must return to selection mode')
            client.evaluate("selectComponent(project.components[0].id); panels.hide('inspector')")
            click("canvas.querySelector('.link-anchor[data-body=\"' + project.components[0].id + '\"]')")
            check("linkEditor.selected === project.links[0].id && panels.isActive('inspector') && !document.getElementById('delete-link').disabled",
                  'Clicking a connected anchor must select its link and reveal Inspector')
            check('!selected()', 'A link selection must not leave a component selected for deletion')
            client.evaluate("document.getElementById('link-distance_x').focus()")
            key('Delete', 46)
            check('project.links.length === 1 && project.components.length === 4', 'Delete in an inspector field must keep text editing')
            click("canvas.querySelector('.link-anchor[data-body=\"' + project.components[0].id + '\"]')")
            key('Delete', 46)
            check('project.links.length === 0 && project.components.length === 4 && projectRoot.windows.length === 1',
                  'Delete must remove only the selected link')
            check("!canvas.querySelector('.link-anchor') && document.getElementById('delete-link').disabled", 'Deleted links must leave no stale handles')
            # Seed a constrained follower away from its authoring position, then
            # select the line and delete it through the visible Inspector button.
            client.evaluate('''(() => {
              const c = project.components[0];
              c.box.x = 30;
              project.links = [{id:'delete-test', a:{body:'$window',edge:'left'},
                b:{body:c.id,edge:'left'}, axis:'both',distance_x:.25,distance_y:-.2}];
              render();
              globalThis.beforeLinkDelete = {...relativeLayout.rectangles.get(c.id)};
              const line = canvas.querySelector('.link-hit');
              const path = line.getPointAtLength(line.getTotalLength()/2);
              globalThis.linkMidpoint = {x:canvas.getBoundingClientRect().left + path.x*windowScale,
                y:canvas.getBoundingClientRect().top + path.y*windowScale};
            })()''')
            point = client.evaluate('linkMidpoint')
            client.command('Input.dispatchMouseEvent', type='mousePressed', button='left', clickCount=1, **point)
            client.command('Input.dispatchMouseEvent', type='mouseReleased', button='left', clickCount=1, **point)
            check("linkEditor.selected === 'delete-test'", 'Clicking the line must also select the link')
            click("document.getElementById('delete-link')")
            check("!project.links.length && JSON.stringify(relativeLayout.rectangles.get(project.components[0].id)) === JSON.stringify(beforeLinkDelete)",
                  'Inspector deletion must preserve the displayed follower rectangle')
            check('project.components.length === 4 && projectRoot.event_code && project.components[0].size_mode === "fixed"',
                  'Unlinking must preserve controls, source and size behavior')
            client.evaluate('''(() => {
              const [a,b] = project.components;
              project.links = [a,b].map((c,i) => ({id:'shared-'+i,
                a:{body:'$window',edge:'left'}, b:{body:c.id,edge:'left'},
                axis:'both',distance_x:.25+i*.2,distance_y:-.2+i*.3}));
              render(); linkEditor.clearSelection();
            })()''')
            click("document.querySelector('#container-anchors [data-anchor=left]')")
            check("linkEditor.selected === 'shared-0'", 'A shared window anchor must select its first link')
            click("document.querySelector('#container-anchors [data-anchor=left]')")
            check("linkEditor.selected === 'shared-1'", 'Clicking a shared anchor again must cycle its links')
            key('Delete', 46)
            check("project.links.length === 1 && project.links[0].id === 'shared-0'", 'Deleting a shared link must keep its sibling')
            client.evaluate("selectComponent(project.components[0].id)")
            check("!linkEditor.selected && document.getElementById('delete-link').disabled", 'Component selection must clear link selection')
            client.evaluate('''(() => {
              const [a,b] = project.components;
              a.box = {x:240,y:160,width:150,height:64,reference_width:960,reference_height:640};
              project.links = [{id:'zero',a:{body:a.id,edge:'right'},b:{body:b.id,edge:'left'},
                axis:'both',distance_x:0,distance_y:0}];
              render();
              canvas.querySelector('.link-anchor').focus();
            })()''')
            key('Enter', 13)
            check("linkEditor.selected === 'zero'", 'A zero-length link must be selectable by its keyboard-focusable endpoint')
            click("canvas.querySelector('.link-anchor')")
            check("linkEditor.selected === 'zero'", 'Coincident endpoints must remain selectable by a real mouse')
            key('Delete', 46)
            check("!project.links.length && project.components.length === 4", 'A zero-length link must be removable without deleting controls')
            check(f'JSON.stringify(projectRoot.event_code) === {json.dumps(json.dumps(original["event_code"], separators=(",", ":")))}',
                  'Selecting and deleting links must preserve authored Python source')
            client.evaluate('''(async () => {
              await sync();
              const data = await viperHost.request('bootstrap');
              globalThis.linkDeletePersisted = data.project.windows[0].links.length === 0 && data.project.windows[0].components.length === 4;
            })()''')
            check('linkDeletePersisted', 'Deleted links must remain deleted in the serialized project state')
        return {'passed': passed}
    finally:
        client.evaluate(f'''(() => {{
          replaceProject({json.dumps(original)});
          for (const [key,value] of Object.entries({json.dumps(preferences)})) preferences.set(key,value);
          panels.restore({json.dumps(workspace)}); applyPreferences(); sync();
        }})()''')
