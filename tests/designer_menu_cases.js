/* Run inside the real designer WebView; restore project and editor preferences. */
(async () => {
  const originalProject = clone(projectRoot), originalPreferences = {...preferences.values};
  const originalWorkspace = panels.snapshot();
  const originalRequest = viperHost.request, originalConfirm = window.confirm;
  let checks = 0;
  const assert = (condition, message) => { if (!condition) throw new Error(message); checks++; };
  const key = (target, name, options = {}) => {
    const event = new KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true, ...options});
    target.dispatchEvent(event); return event;
  };
  try {
    panels.reset();
    assert(menus.buttons.map(b => b.textContent).join(',') === 'File,Edit,Insert,Layout,View,Run,Windows', 'Seven main menus');
    assert(document.querySelectorAll('.compact-toolbar [data-action]').length === 7, 'Seven frequent tools');
    const isolated = new ViperActionRegistry(); let called = 0;
    isolated.register({id: 'disabled', name: 'Disabled', enabled: false, callback: () => called++});
    assert(!isolated.execute('disabled') && called === 0, 'Disabled commands never execute');
    let duplicateRejected = false;
    try { isolated.register({id: 'disabled', name: 'Duplicate'}); } catch (_) { duplicateRejected = true; }
    assert(duplicateRejected, 'Action IDs are unique');
    selectedId = null; render();
    assert(!actions.state('duplicate').enabled && actions.state('delete').enabled, 'Selection controls enabled state');
    assert(!actions.state('undo').enabled && !actions.state('align-left').enabled && actions.state('new-window').enabled,
      'Unsupported commands remain disabled and new windows are available');

    menus.buttons[2].click();
    const submenu = menus.popups[0].node.querySelector('.submenu-heading');
    submenu.focus(); key(submenu, 'ArrowRight');
    assert(menus.popups.length === 2 && document.activeElement.dataset.action === 'insert-button', 'Right arrow enters submenu');
    key(document.activeElement, 'End');
    assert(document.activeElement.dataset.action === 'insert-panel', 'End selects last submenu command');
    key(document.activeElement, 'Home');
    const beforeInsert = project.components.length;
    document.activeElement.click();
    assert(project.components.length === beforeInsert + 1 && !menus.popups.length, 'Insert uses the existing creation command');
    const component = selected(); component.event_handlers = {click: 'user_handler'};
    key(canvas, 'd', {ctrlKey: true});
    assert(project.components.length === beforeInsert + 2 && selected().event_handlers.click === 'user_handler', 'Shortcut duplication preserves handlers');
    const nameInput = document.getElementById('component-name'), count = project.components.length;
    assert(!key(nameInput, 'Delete').defaultPrevented && project.components.length === count, 'Delete preserves input editing');
    assert(!key(nameInput, 'z', {ctrlKey: true}).defaultPrevented, 'Native text undo remains available');
    key(canvas, 'Delete');
    assert(project.components.length === count - 1 && actions.state('delete').enabled, 'Keyboard deletion updates all action state');

    selectComponent(component.id);
    const wrapper = canvas.querySelector('.component-wrapper.selected');
    wrapper.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 300, clientY: 200}));
    assert(menus.popups.length === 1 && menus.popups[0].node.querySelector('[data-action="duplicate"]').disabled === false,
      'Context menu uses current selection');
    menus.popups[0].node.querySelector('.submenu-heading').click();
    assert([...menus.popups[1].node.querySelectorAll('button')].every(b => b.disabled), 'Alignment unavailable with one selected element');
    key(document.activeElement, 'ArrowLeft');
    assert(menus.popups.length === 1, 'Left arrow returns from submenu');
    menus.popups[0].node.querySelector('[data-action="duplicate"]').click();
    assert(selected().id !== component.id && selected().event_handlers.click === 'user_handler', 'Context duplicate shares command');

    preferences.set('showGrid', true); preferences.set('snapGrid', false); preferences.set('snapElements', false); applyPreferences();
    actions.execute('show-grid'); document.getElementById('snap-grid').click();
    assert(!preferences.values.showGrid && preferences.values.snapGrid && !preferences.values.snapElements,
      'Grid visibility and snap toggles are independent');
    assert(document.getElementById('snap-grid').getAttribute('aria-pressed') === 'true', 'Toolbar toggle reflects registry');
    menus.buttons[3].click();
    assert(menus.popups[0].node.querySelector('[data-action="snap-grid"]').getAttribute('aria-checked') === 'true', 'Menu toggle shares checked state');
    const restored = new ViperDesignerPreferences(preferenceStorage);
    assert(!restored.values.showGrid && restored.values.snapGrid && !restored.values.snapElements, 'Preferences survive reload');
    key(document.activeElement, 'Escape');
    assert(!menus.popups.length && document.activeElement === menus.buttons[3], 'Escape closes menus and restores focus');
    menus.buttons[0].click();
    viewport.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, button: 2}));
    assert(!menus.popups.length, 'Outside pointer closes menus');
    key(canvas, 'F10');
    assert(document.activeElement === menus.buttons[0], 'F10 focuses menu bar');
    key(document.activeElement, 'ArrowDown'); key(document.activeElement, 'ArrowRight');
    assert(menus.rootIndex === 1, 'Arrow keys move between main menus');
    key(document.activeElement, 'v', {altKey: true});
    assert(menus.rootIndex === 4, 'Menu mnemonics open the correct menu'); menus.close(false);
    actions.execute('grid-settings');
    const spacing = document.getElementById('grid-size'); spacing.value = '';
    assert(!spacing.checkValidity(), 'Empty grid spacing is rejected');
    let invalidSpacingRejected = false;
    try { preferences.set('gridSize', 0); } catch (_) { invalidSpacingRejected = true; }
    assert(invalidSpacingRejected, 'Preference validation prevents invalid snapping');
    spacing.value = '24'; document.getElementById('apply-grid-settings').click();
    assert(preferences.values.gridSize === 24 && gridSettings.hidden, 'Grid settings apply and close');
    preferences.set('showAnchors', true); applyPreferences(); actions.execute('show-anchors');
    assert(getComputedStyle(canvas.querySelector('.component-wrapper.selected .position-anchor')).display === 'none', 'Show Anchors controls authoring affordances');
    preferences.set('properties', true); applyPreferences(); actions.execute('properties-panel');
    assert(document.querySelector('.inspector').getBoundingClientRect().width === 0, 'Properties panel toggle reclaims workspace');
    actions.execute('show-properties');
    assert(preferences.values.properties && document.activeElement === nameInput, 'Properties command reveals and focuses inspector');

    preferences.set('gridSize', 16);
    selectComponent(component.id); component.box = {x: 40, y: 40, width: 80, height: 32,
      reference_width: project.canvas_width, reference_height: project.canvas_height}; render();
    const draggable = canvas.querySelector('.component-wrapper.selected');
    draggable.setPointerCapture = () => {}; draggable.hasPointerCapture = () => false;
    draggable.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 33, button: 0, clientX: 100, clientY: 100, bubbles: true}));
    draggable.dispatchEvent(new PointerEvent('pointermove', {pointerId: 33, clientX: 100 + 3 * windowScale,
      clientY: 100 + 5 * windowScale, bubbles: true}));
    draggable.dispatchEvent(new PointerEvent('pointerup', {pointerId: 33, bubbles: true}));
    const snapped = relativeLayout.rectangles.get(component.id);
    assert(snapped.x === 48 && snapped.y === 48 && !preferences.values.showGrid, 'Dragging snaps even with grid hidden');
    preferences.set('snapGrid', false); preferences.set('snapElements', true);
    const rectangles = new Map([['other', {x: 100, y: 100, width: 80, height: 32}]]);
    const aligned = preferences.snap('moving', {x: 98, y: 98, width: 80, height: 32}, rectangles, 960, 640, 1);
    assert(aligned.x === 100 && aligned.y === 100, 'Element snapping is independent of grid');
    const unchanged = new ViperDesignerPreferences();
    assert(unchanged.snap('moving', {x: 98, y: 98, width: 80, height: 32}, rectangles, 960, 640, 1).x === 98,
      'Default movement is unchanged');

    actions.execute('preview');
    assert(actions.state('preview').checked && actions.state('stop').enabled && !actions.state('duplicate').enabled &&
      !actions.state('connect-links').enabled && !canvas.querySelector('.component-wrapper'), 'Preview disables editing');
    key(nameInput, 'F5', {shiftKey: true});
    assert(!preview && !actions.state('stop').enabled, 'Stop Preview works while an input is focused');
    actions.execute('connect-links'); menus.buttons[3].click(); key(document.activeElement, 'Escape');
    assert(linkEditor.connecting && !menus.popups.length, 'Menu Escape does not also cancel the current tool');
    key(canvas, 'Escape'); assert(!linkEditor.connecting, 'Next Escape exits anchor tool');

    const chromeRect = menus.chrome.getBoundingClientRect(), workspaceRect = workspace.getBoundingClientRect();
    assert(chromeRect.top === 0 && chromeRect.height === 68 && workspaceRect.top === chromeRect.bottom, 'Root layout reserves chrome space');
    const intruder = document.createElement('div');
    intruder.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:red'; workspace.appendChild(intruder);
    const headingRect = menus.buttons[0].getBoundingClientRect();
    assert(document.elementFromPoint(headingRect.left + 5, headingRect.top + 5) === menus.buttons[0], 'Workspace stacking cannot cover menu bar');
    intruder.remove();
    menus.buttons[0].click();
    assert(menus.popups[0].node.getBoundingClientRect().top >= chromeRect.bottom, 'Dropdown respects chrome boundary');
    menus.close(false);
    const currentProject = project, currentRoot = projectRoot; project = undefined; projectRoot = undefined; render();
    assert(!actions.state('save-project').enabled && actions.state('new-project').enabled && actions.state('open-project').enabled,
      'Chrome works without a project');
    menus.buttons[4].click();
    assert(menus.popups.length === 1, 'View menu works without a project'); menus.close(false);
    projectRoot = currentRoot; project = currentProject; render();

    await queue;
    const requests = [];
    window.confirm = () => true;
    viperHost.request = async (command, payload) => {
      requests.push({command, payload});
      if (command === 'new') return {...clone(originalProject), name: 'New menu project'};
      if (command === 'open') return {project: {...clone(originalProject), name: 'Opened menu project'}};
      if (command === 'save') return {cancelled: true};
      return {started: true};
    };
    menus.buttons[0].click(); key(document.activeElement, 's', {ctrlKey: true}); await queue;
    assert(requests.slice(-2).map(r => r.command).join(',') === 'update,save' && !menus.popups.length && status.textContent === 'Save cancelled',
      'Save shortcut shares toolbar callback, queues state first and preserves cancellation');
    actions.execute('save-as'); await queue;
    assert(requests.slice(-2).map(r => r.command).join(',') === 'update,save', 'Save As reuses native save destination dialog');
    document.getElementById('run').click(); await queue;
    assert(requests.slice(-2).map(r => r.command).join(',') === 'update,run', 'Run sends the same synchronized project');
    key(nameInput, 'o', {ctrlKey: true}); await queue;
    assert(projectRoot.name === 'Opened menu project' && !selectedId, 'Open shortcut uses project replacement');
    actions.execute('preview'); key(canvas, 'n', {ctrlKey: true}); await queue;
    assert(projectRoot.name === 'New menu project' && !preview && !selectedId, 'New restores an editable project');
    assert(originalProject.windows[0].components[0].event_handlers && requests.every(r => r.command !== 'event'), 'Commands preserve event dispatch boundary');
    return {passed: checks};
  } catch (error) { return {passed: checks, error: error.message, stack: error.stack}; }
  finally {
    viperHost.request = originalRequest; window.confirm = originalConfirm;
    for (const [name, value] of Object.entries(originalPreferences)) preferences.set(name, value);
    panels.restore(originalWorkspace);
    menus.close(false); applyPreferences(); replaceProject(originalProject); await sync();
  }
})()
