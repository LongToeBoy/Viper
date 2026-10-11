/* Designer command composition; the reusable menu code has no project logic. */
function createViperDesignerChrome(actions, commands, state, preferences) {
  const editing = () => state.hasProject() && !state.preview() && !state.events();
  const selection = () => editing() && state.hasSelection();
  const register = (id, name, callback, options = {}) => actions.register({id, name, callback, ...options});
  const future = (id, name, reason, shortcut = '', icon = '') => register(id, name, () => {}, {enabled: false, reason, shortcut, icon});
  const toggle = (id, name, key, icon = '') => register(id, name, () => {
    preferences.set(key, !preferences.values[key]); commands.preferencesChanged();
  }, {icon, checked: () => preferences.values[key]});

  register('new-project', 'New Project', commands.newProject, {shortcut: 'Ctrl+N', allowInInput: true});
  register('open-project', 'Open Project…', commands.openProject, {shortcut: 'Ctrl+O', allowInInput: true});
  register('save-project', 'Save', commands.saveProject, {icon: 'save', shortcut: 'Ctrl+S', enabled: state.hasProject, allowInInput: true});
  // Save already opens the native destination dialog, so both entries reuse it.
  register('save-as', 'Save As…', commands.saveProject, {shortcut: 'Ctrl+Shift+S', enabled: state.hasProject, allowInInput: true});
  future('recent-projects', 'Recent Projects', 'Recent project history is not implemented');
  future('undo', 'Undo', 'Undo history is not implemented', 'Ctrl+Z', 'undo');
  future('redo', 'Redo', 'Undo history is not implemented', 'Ctrl+Shift+Z', 'redo');
  future('cut', 'Cut', 'Element clipboard is not implemented', 'Ctrl+X');
  future('copy', 'Copy', 'Element clipboard is not implemented', 'Ctrl+C');
  future('paste', 'Paste', 'Element clipboard is not implemented', 'Ctrl+V');
  register('duplicate', 'Duplicate', commands.duplicate, {shortcut: 'Ctrl+D', enabled: selection});
  register('delete', 'Delete', commands.remove, {shortcut: 'Delete', enabled: selection});
  future('select-all', 'Select All', 'Multiple element selection is not implemented', 'Ctrl+A');
  register('new-window', 'New Window', commands.newWindow, {enabled: () => state.hasProject() && !state.preview()});
  register('select-window', 'Window Properties', commands.windowProperties, {enabled: editing});
  const widgets = {name: 'Widgets and Controls', items: []};
  for (const item of document.querySelectorAll('.tool-item')) {
    const id = `insert-${item.dataset.kind}`;
    register(id, item.textContent, () => commands.add(item.dataset.kind), {enabled: () => editing() && state.hasWidget(item.dataset.kind)});
    item.onclick = () => actions.execute(id); widgets.items.push(id);
  }
  const align = {name: 'Align Elements', items: []}, distribute = {name: 'Distribute Elements', items: []};
  for (const [id, name] of [['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom'],
    ['horizontal-center', 'Horizontal Center'], ['vertical-center', 'Vertical Center']]) {
    future(`align-${id}`, name, 'Requires multiple element selection (not implemented)'); align.items.push(`align-${id}`);
  }
  for (const direction of ['Horizontal', 'Vertical']) {
    const id = `distribute-${direction.toLowerCase()}`;
    future(id, direction, 'Requires multiple element selection (not implemented)'); distribute.items.push(id);
  }
  toggle('snap-grid', 'Snap to Grid', 'snapGrid', 'grid');
  toggle('snap-elements', 'Snap to Elements', 'snapElements', 'snap');
  register('connect-links', 'Connect Anchors', commands.connect, {enabled: editing, checked: state.connecting});
  register('grid-settings', 'Grid Settings…', commands.gridSettings);
  toggle('show-grid', 'Show Grid', 'showGrid');
  toggle('show-anchors', 'Show Anchors', 'showAnchors');
  register('properties-panel', 'Inspector', () => commands.toggleTool('inspector'), {checked: () => state.toolOpen('inspector')});
  register('components-panel', 'Components', () => commands.toggleTool('components'), {checked: () => state.toolOpen('components')});
  register('reset-workspace', 'Reset Workspace', commands.resetWorkspace);
  future('element-hierarchy', 'Element Hierarchy', 'The hierarchy panel is not implemented');
  const zoom = {name: 'Zoom', items: ['zoom-in', 'zoom-out', 'zoom-reset']};
  register('zoom-in', 'Zoom In', () => commands.zoom(1.2), {shortcut: 'Ctrl+=', enabled: state.hasProject});
  register('zoom-out', 'Zoom Out', () => commands.zoom(1 / 1.2), {shortcut: 'Ctrl+-', enabled: state.hasProject});
  register('zoom-reset', 'Reset / Fit Window', () => commands.zoom(null), {shortcut: 'Ctrl+0', enabled: state.hasProject});
  register('preview', 'Preview', commands.preview, {icon: 'preview', shortcut: 'F6', enabled: state.hasProject, checked: state.preview, allowInInput: true});
  register('run', 'Run Application', commands.run, {icon: 'run', toolbarLabel: 'Run', shortcut: 'F5', enabled: state.hasProject, allowInInput: true});
  register('stop', 'Stop Preview', commands.preview, {shortcut: 'Shift+F5', enabled: state.preview, allowInInput: true});
  future('build', 'Build / Package', 'Application packaging is not implemented');
  register('show-properties', 'Properties', commands.properties, {enabled: selection});
  register('edit-events', 'Edit Events', commands.events, {enabled: selection});
  const definitions = [
    {name: 'File', items: ['new-project', 'open-project', null, 'save-project', 'save-as', null, 'recent-projects']},
    {name: 'Edit', items: ['undo', 'redo', null, 'cut', 'copy', 'paste', null, 'duplicate', 'delete', 'select-all']},
    {name: 'Insert', items: ['new-window', widgets]},
    {name: 'Layout', items: [align, distribute, null, 'snap-grid', 'snap-elements', null, 'connect-links', 'grid-settings']},
    {name: 'View', items: ['show-grid', 'show-anchors', null, 'properties-panel', 'element-hierarchy', 'select-window', null, zoom]},
    {name: 'Run', items: ['preview', 'run', 'stop', null, 'build']},
    {name: 'Windows', items: ['components-panel', 'properties-panel', null, 'reset-workspace']}
  ];
  const menus = new ViperMenus(actions, document.getElementById('application-chrome'), definitions,
    ['save-project', null, 'undo', 'redo', null, 'snap-grid', 'snap-elements', null, 'preview', 'run']);
  const context = ['edit-events', null, 'duplicate', 'delete', null, align, 'connect-links', null, 'show-properties'];
  commands.canvas.addEventListener('contextmenu', event => {
    const wrapper = event.target.closest('.component-wrapper');
    if (!editing() || !wrapper) return;
    event.preventDefault(); commands.select(wrapper.dataset.id);
    commands.canvas.tabIndex = -1;
    menus.context(context, event.clientX, event.clientY, commands.canvas);
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') commands.escape();
    else if (actions.handleKey(event)) menus.close(false);
  });
  return menus;
}
globalThis.createViperDesignerChrome = createViperDesignerChrome;
