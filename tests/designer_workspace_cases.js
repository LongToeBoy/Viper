/* Exercise tool layout in the real WebView, retaining the existing tool DOM. */
(async () => {
  const originalLayout = panels.snapshot(), originalProject = clone(projectRoot);
  const originalCapture = workspace.setPointerCapture, originalHasCapture = workspace.hasPointerCapture;
  let checks = 0, pointerId = 70;
  const assert = (condition, message) => { if (!condition) throw new Error(message); checks++; };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const bounds = tool => panels.groupNodes.get(panels.groupFor(tool).id).getBoundingClientRect();
  const groupNode = tool => panels.groupNodes.get(panels.groupFor(tool).id);
  const pointer = (target, type, id, x, y) => target.dispatchEvent(new PointerEvent(type, {
    pointerId: id, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true}));
  const start = element => {
    const rect = element.getBoundingClientRect(), id = ++pointerId, x = rect.left + Math.min(20, rect.width / 2), y = rect.top + rect.height / 2;
    pointer(element, 'pointerdown', id, x, y); return {id, x, y};
  };
  const finish = async gesture => { pointer(document, 'pointerup', gesture.id, gesture.x, gesture.y); await tick(); };
  const drop = async (tool, targetSide, tab = false) => {
    const gesture = start(groupNode(tool).querySelector(tab ? `[data-tool="${tool}"]` : '.panel-title'));
    pointer(document, 'pointermove', gesture.id, gesture.x + 10, gesture.y + 10);
    const target = panels.dropTargets.find(target => target.destination.location === targetSide || target.destination.groupId === targetSide);
    const rect = target.node.getBoundingClientRect();
    gesture.x = rect.left + rect.width / 2; gesture.y = rect.top + rect.height / 2;
    pointer(document, 'pointermove', gesture.id, gesture.x, gesture.y); await finish(gesture);
  };
  const rejects = state => { try { ViperDesignerWorkspace.normalize(state, panels.definitions); return false; } catch (_) { return true; } };
  const stable = value => JSON.stringify(value, Object.keys(value).sort());
  try {
    panels.reset(); workspace.setPointerCapture = () => {}; workspace.hasPointerCapture = () => false;
    const projectBefore = JSON.stringify(projectRoot);
    assert(panels.groupFor('components').location === 'left' && panels.groupFor('inspector').location === 'right', 'Default tools dock on opposite sides');
    assert(menus.buttons.at(-1).textContent === 'Windows' && actions.state('components-panel').checked && actions.state('properties-panel').checked,
      'Windows menu reflects open tools');
    menus.buttons.at(-1).click();
    assert(menus.popups[0].node.querySelector('[data-action="components-panel"]').getAttribute('aria-checked') === 'true', 'Windows menu shares panel state');
    menus.close(false);
    const inspectorElement = document.getElementById('inspector-tool');
    selectComponent(project.components[0].id);
    const nameInput = document.getElementById('component-name');
    nameInput.value = 'Unsaved inspector draft'; nameInput.focus(); nameInput.setSelectionRange(2, 6);
    panels.float('inspector');
    assert(panels.groupFor('inspector').location === 'floating' && workspace.querySelector('#dock-right').hidden, 'Float releases the dock');
    assert(document.activeElement === nameInput && nameInput.selectionStart === 2 && nameInput.selectionEnd === 6 && nameInput.value === 'Unsaved inspector draft',
      'Moving Inspector retains draft text, caret and focus');
    assert(document.getElementById('inspector-tool') === inspectorElement && groupNode('inspector').contains(inspectorElement), 'Tools retain their original DOM and listeners');
    const floating = bounds('inspector'), root = workspace.getBoundingClientRect();
    assert(floating.left >= root.left && floating.right <= root.right + .1 && floating.top >= root.top && floating.bottom <= root.bottom + .1,
      'Floating tools stay within the workspace');
    const old = {...panels.groupFor('inspector').rect}, gesture = start(groupNode('inspector').querySelector('.panel-title'));
    pointer(document, 'pointermove', gesture.id, gesture.x - 120, gesture.y + 40);
    assert(!panels.targets.hidden && panels.targets.querySelectorAll('.dock-target').length >= 4, 'Drag exposes docking targets');
    await finish(gesture);
    assert(panels.groupFor('inspector').rect.x !== old.x && panels.groupFor('inspector').rect.y !== old.y, 'Title drag moves a floating tool');
    assert(panels.targets.hidden && !workspace.classList.contains('workspace-dragging'), 'Release clears the drag overlay');
    const beforeResize = {...panels.groupFor('inspector').rect}, resize = start(groupNode('inspector').querySelector('.floating-resizer'));
    pointer(document, 'pointermove', resize.id, resize.x + 50, resize.y - 30); await finish(resize);
    assert(panels.groupFor('inspector').rect.width === beforeResize.width + 50 && panels.groupFor('inspector').rect.height === beforeResize.height - 30,
      'Floating tools resize without rebuilding their content');
    await drop('inspector', 'left');
    assert(panels.groupFor('inspector') === panels.groupFor('components') && panels.state.groups.length === 1, 'Dropping onto an occupied dock creates one tabbed group');
    assert(groupNode('inspector').querySelectorAll('.panel-tab').length === 2 && panels.isActive('inspector') && document.getElementById('components-tool').hidden,
      'Dock group shows only its active tool');
    await drop('inspector', 'bottom');
    assert(panels.groupFor('inspector') === panels.groupFor('components') && panels.groupFor('components').location === 'bottom',
      'Dragging a grouped title bar moves every tool together');
    await drop('inspector', 'left');
    groupNode('components').querySelector('[data-tool="components"]').click();
    assert(panels.isActive('components') && inspectorElement.hidden && !document.getElementById('components-tool').hidden, 'Tool tabs switch content');
    const tab = groupNode('components').querySelector('[data-tool="components"]'); tab.focus();
    tab.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true, cancelable: true}));
    assert(panels.isActive('inspector') && document.activeElement.dataset.tool === 'inspector', 'Tool tabs support keyboard switching');
    actions.execute('show-properties');
    assert(document.activeElement === nameInput && panels.isActive('inspector'), 'Properties activates the Inspector inside its group');
    await drop('inspector', 'right', true);
    assert(panels.groupFor('inspector').location === 'right' && panels.groupFor('components').location === 'left', 'Dragging one tab detaches only that tool');
    const splitter = workspace.querySelector('#dock-right .dock-splitter'), dockResize = start(splitter), oldSize = panels.state.sizes.right;
    pointer(document, 'pointermove', dockResize.id, dockResize.x - 40, dockResize.y); await finish(dockResize);
    assert(Math.abs(panels.state.sizes.right - oldSize - 40) < 1, 'Dock splitter resizes its side');
    workspace.querySelector('#dock-right .dock-splitter').dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true, cancelable: true}));
    assert(Math.abs(panels.state.sizes.right - oldSize - 52) < 1, 'Dock splitter supports keyboard resizing');
    await drop('inspector', 'bottom');
    assert(panels.groupFor('inspector').location === 'bottom' && !workspace.querySelector('#dock-bottom').hidden, 'Tools dock at the bottom');
    await drop('inspector', 'top');
    assert(panels.groupFor('inspector').location === 'top' && !workspace.querySelector('#dock-top').hidden, 'Tools dock at the top');
    const cancelState = panels.snapshot(), cancel = start(groupNode('inspector').querySelector('.panel-title'));
    pointer(document, 'pointermove', cancel.id, cancel.x + 60, cancel.y + 80);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true})); await tick();
    assert(JSON.stringify(panels.snapshot()) === JSON.stringify(cancelState) && panels.targets.hidden, 'Escape restores the original layout');
    const cancelledPointer = start(groupNode('inspector').querySelector('.panel-title'));
    pointer(document, 'pointermove', cancelledPointer.id, cancelledPointer.x + 40, cancelledPointer.y + 30);
    pointer(document, 'pointercancel', cancelledPointer.id, cancelledPointer.x, cancelledPointer.y); await tick();
    assert(JSON.stringify(panels.snapshot()) === JSON.stringify(cancelState), 'Pointer cancellation preserves the layout');
    const placement = groupNode('inspector').querySelector('.panel-placement'); placement.value = 'floating'; placement.dispatchEvent(new Event('change'));
    assert(panels.groupFor('inspector').location === 'floating', 'Placement control floats a tool without dragging');
    panels.float('components');
    const targetGroup = panels.groupFor('components').id;
    await drop('inspector', targetGroup);
    assert(panels.groupFor('inspector').id === targetGroup && panels.groupFor('inspector').location === 'floating', 'Floating tools can join a tabbed group');
    const rememberedGroup = panels.groupFor('inspector').id;
    groupNode('inspector').querySelector('.panel-header button').click();
    assert(!panels.isOpen('inspector') && panels.isOpen('components') && !actions.state('properties-panel').checked, 'Close removes only the active tool');
    panels.hide('components');
    assert(panels.state.groups.length === 0 && panels.state.closed.length === 2, 'Closing all tools leaves the documents usable');
    actions.execute('properties-panel'); actions.execute('components-panel');
    assert(panels.groupFor('inspector').id === rememberedGroup && panels.groupFor('components').id === rememberedGroup, 'Reopening restores a closed floating tab group');
    const saved = panels.snapshot();
    assert(JSON.stringify(JSON.parse(preferenceStorage.getItem(ViperDesignerWorkspace.key))) === JSON.stringify(saved), 'Workspace layout persists separately in local storage');
    const reloaded = ViperDesignerWorkspace.normalize(saved, panels.definitions);
    assert(reloaded.groups.length === saved.groups.length && reloaded.groups.every((group, index) => {
      const expected = saved.groups[index];
      return group.id === expected.id && group.location === expected.location && group.active === expected.active &&
        group.tools.join(',') === expected.tools.join(',') && stable(group.rect) === stable(expected.rect);
    }) && stable(reloaded.sizes) === stable(saved.sizes), 'Saved groups, active tabs and rectangles reload exactly');
    assert(JSON.stringify(projectRoot) === projectBefore, 'Panel operations never modify project geometry or source');
    const future = ViperDesignerWorkspace.normalize(saved, [...panels.definitions, {id: 'project', location: 'left'}]);
    assert(future.groups.length === saved.groups.length && future.closed.some(tool => tool.tool === 'project'), 'Future tools can register without resetting the layout');
    const invalidSize = clone(saved); invalidSize.sizes.left = null;
    assert(rejects(invalidSize), 'Invalid stored dimensions are rejected');
    const duplicateTool = clone(saved); duplicateTool.groups[0].tools.push(duplicateTool.groups[0].tools[0]);
    assert(rejects(duplicateTool), 'Duplicate tool membership is rejected');
    const invalidRect = clone(saved); invalidRect.groups[0].rect.width = -1;
    assert(rejects(invalidRect), 'Invalid floating rectangles are rejected');
    const invalidLocation = clone(saved); invalidLocation.groups[0].location = 'elsewhere';
    assert(rejects(invalidLocation), 'Unknown docking locations are rejected');
    const invalidVersion = clone(saved); invalidVersion.version = 99;
    assert(rejects(invalidVersion), 'Unknown layout versions are rejected');
    const fixture = document.createElement('div'); fixture.hidden = true;
    fixture.innerHTML = '<div id="tool-parking"></div><div id="floating-tools"></div><div id="dock-targets"></div>' +
      ViperDesignerWorkspace.sides.map(side => `<div id="dock-${side}"></div>`).join('');
    const probe = document.createElement('aside'); probe.id = 'workspace-probe'; fixture.appendChild(probe); workspace.appendChild(fixture);
    const restoredTools = panels.definitions.map(tool => {
      const element = document.createElement('aside'); element.id = `restored-${tool.id}`; fixture.appendChild(element);
      return {...tool, element};
    });
    const reloadedWorkspace = new ViperDesignerWorkspace(fixture, restoredTools, {storage: {getItem: () => JSON.stringify(saved)}});
    try {
      assert(reloadedWorkspace.groupFor('inspector').id === rememberedGroup && reloadedWorkspace.groupFor('components').id === rememberedGroup &&
        reloadedWorkspace.isActive(saved.groups[0].active) && stable(reloadedWorkspace.groupFor('inspector').rect) === stable(saved.groups[0].rect),
        'A new workspace instance restores persisted groups, active tools and geometry');
    } finally { reloadedWorkspace.destroy(); }
    const brokenStorage = {getItem() { return '{broken'; }, setItem() { throw new Error('Unavailable storage'); }};
    const fallback = new ViperDesignerWorkspace(fixture, [{id: 'probe', title: 'Probe', location: 'left', element: probe}], {storage: brokenStorage});
    try {
      assert(fallback.groupFor('probe').location === 'left', 'Corrupt storage falls back to a working default');
      fallback.hide('probe'); fallback.show('probe');
      assert(fallback.isOpen('probe'), 'Tools still work when storage cannot be written');
    } finally { fallback.destroy(); fixture.remove(); }
    panels.show('inspector');
    const rectBeforeShrink = {...panels.groupFor('inspector').rect}, originalWidth = workspace.style.width, originalHeight = workspace.style.height;
    try {
      workspace.style.width = '240px'; workspace.style.height = '190px'; panels.applyGeometry();
      const small = bounds('inspector'), smallRoot = workspace.getBoundingClientRect();
      assert(small.left >= smallRoot.left && small.right <= smallRoot.right + .1 && small.top >= smallRoot.top && small.bottom <= smallRoot.bottom + .1,
        'Small workspaces keep floating headers and close controls reachable');
      assert(JSON.stringify(panels.groupFor('inspector').rect) === JSON.stringify(rectBeforeShrink), 'Temporary viewport clamping preserves the saved rectangle');
    } finally { workspace.style.width = originalWidth; workspace.style.height = originalHeight; panels.applyGeometry(); }
    const intruder = groupNode('inspector'); intruder.style.zIndex = '2147483647';
    const menu = menus.buttons[0].getBoundingClientRect();
    assert(document.elementFromPoint(menu.left + 5, menu.top + 5) === menus.buttons[0], 'Floating tools cannot cover the application chrome');
    actions.execute('reset-workspace');
    assert(panels.groupFor('components').location === 'left' && panels.groupFor('inspector').location === 'right' && panels.state.sizes.right === 260,
      'Reset Workspace restores the default docks and sizes');
    return {passed: checks};
  } catch (error) { return {passed: checks, error: error.message, stack: error.stack}; }
  finally {
    workspace.setPointerCapture = originalCapture; workspace.hasPointerCapture = originalHasCapture;
    panels.restore(originalLayout); replaceProject(originalProject); await sync();
  }
})()
