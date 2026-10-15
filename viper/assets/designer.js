const canvas = document.getElementById('canvas');
const surface = new ViperApplicationSurface(canvas);

let project, library, selectedId, preview = false;
let projectRoot, windowDefaults, projectSelected = false;
let previewSession;
let building = false, buildTask = Promise.resolve();
const formViews = new Map();
let queue = Promise.resolve();
const status = document.getElementById('status');
const actions = new ViperActionRegistry(error => { status.textContent = error.message; });
const projectHistory = new ViperProjectHistory();
let preferenceStorage;
try { preferenceStorage = window.localStorage; } catch (_) { /* Session preferences still work. */ }
const preferences = new ViperDesignerPreferences(preferenceStorage);
const workspace = document.getElementById('workspace');
let panels;
const fields = ['name', 'text', 'depth', 'x', 'y', 'width', 'height'];
const frame = document.getElementById('window-frame');
const viewport = document.getElementById('design-viewport');
let windowScale = 1;
let zoom = 1;
let stagePosition = null;
let panGesture = null;
let suppressBoardClick = false;
const linkEditor = new ViperLinkEditor(canvas, document.getElementById('container-anchors'), {
  changed() { render(); sync(); }, status(message) { status.textContent = message; },
  selected() {
    selectedId = null; projectSelected = false;
    surface.root.querySelectorAll('.component-wrapper.selected').forEach(node => node.classList.remove('selected'));
    frame.classList.remove('selected'); panels.show('inspector'); inspector(); actions.refresh();
  },
  modeChanged() { actions.refresh(); }
});
const relativeLayout = new ViperRelativeLayout(canvas, () => {
  if (linkEditor.project === project) linkEditor.draw();
}, error => { status.textContent = error.message; });
const windowFields = {name: 'name', caption: 'title', 'min-width': 'min_width',
  'min-height': 'min_height', resizable: 'resizable', decorated: 'decorated',
  state: 'state', 'theme-background': 'use_theme_background'};
function renderWindow() {
  if (!project || viewport.hidden) return;
  const w = project.window;
  canvas.style.width = `${project.canvas_width}px`;
  canvas.style.height = `${project.canvas_height}px`;
  canvas.style.backgroundColor = w.background_color;
  surface.background(w);
  const titlebar = document.getElementById('window-titlebar');
  titlebar.hidden = !w.decorated || w.state === 'fullscreen';
  document.getElementById('window-title').textContent = w.title;
  const icon = document.getElementById('window-icon-preview');
  icon.hidden = !w.icon; if (w.icon) icon.src = w.icon; else icon.removeAttribute('src');
  document.getElementById('window-maximize').classList.toggle('unavailable', !w.resizable);
  const width = project.canvas_width + 2, height = project.canvas_height + (titlebar.hidden ? 0 : 32) + 2;
  const fitScale = Math.max(.05, Math.min(1, (viewport.clientWidth - 40) / width, (viewport.clientHeight - 40) / height));
  windowScale = fitScale * zoom;
  frame.style.width = `${width}px`; frame.style.transform = `scale(${windowScale})`;
  const stage = document.getElementById('window-stage');
  stage.style.width = `${width * windowScale}px`; stage.style.height = `${height * windowScale}px`;
  if (!stagePosition) {
    stagePosition = {x: (viewport.clientWidth - width * windowScale) / 2,
      y: (viewport.clientHeight - height * windowScale) / 2};
  }
  stage.style.left = `${stagePosition.x}px`; stage.style.top = `${stagePosition.y}px`;
  frame.classList.toggle('selected', !selectedId && !projectSelected && !preview && !linkEditor.selected);
  document.getElementById('window-resize').hidden = preview || projectSelected;
}
function selectWindow() {
  if (preview || !project) return;
  linkEditor.clearSelection();
  selectedId = null; projectSelected = false; explorer.reveal(hierarchySelection()); render();
}
document.getElementById('window-titlebar').onclick = selectWindow;
document.getElementById('window-titlebar').onkeydown = event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectWindow(); }
};
canvas.addEventListener('click', event => { if (event.target === canvas) selectWindow(); });
viewport.addEventListener('pointerdown', event => {
  if (event.button !== 0 && event.button !== 1) return;
  if (event.target.closest('.component-wrapper, .component, .container-anchor, .link-hit, .link-anchor') || event.target.id === 'window-resize' || !stagePosition) return;
  event.preventDefault();
  panGesture = {pointerId: event.pointerId, x: event.clientX, y: event.clientY,
    originX: stagePosition.x, originY: stagePosition.y, moved: false};
});
document.addEventListener('pointermove', event => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) return;
  const dx = event.clientX - panGesture.x, dy = event.clientY - panGesture.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) panGesture.moved = true;
  if (!panGesture.moved) return;
  stagePosition = {x: panGesture.originX + dx, y: panGesture.originY + dy};
  const stage = document.getElementById('window-stage');
  stage.style.left = `${stagePosition.x}px`; stage.style.top = `${stagePosition.y}px`;
  viewport.classList.add('is-panning');
});
document.addEventListener('pointerup', event => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) return;
  suppressBoardClick = panGesture.moved;
  panGesture = null; viewport.classList.remove('is-panning');
});
viewport.addEventListener('click', event => {
  if (!suppressBoardClick) return;
  event.preventDefault(); event.stopPropagation(); suppressBoardClick = false;
}, true);
viewport.addEventListener('wheel', event => {
  event.preventDefault();
  if (!project || !stagePosition) return;
  const oldScale = windowScale;
  const nextZoom = Math.max(.2, Math.min(5, zoom * Math.exp(-event.deltaY * .0015)));
  if (nextZoom === zoom) return;
  const rect = viewport.getBoundingClientRect();
  const cursorX = event.clientX - rect.left, cursorY = event.clientY - rect.top;
  const boardX = (cursorX - stagePosition.x) / oldScale;
  const boardY = (cursorY - stagePosition.y) / oldScale;
  zoom = nextZoom; renderWindow();
  stagePosition = {x: cursorX - boardX * windowScale, y: cursorY - boardY * windowScale};
  const stage = document.getElementById('window-stage');
  stage.style.left = `${stagePosition.x}px`; stage.style.top = `${stagePosition.y}px`;
}, {passive: false});
const clone = value => JSON.parse(JSON.stringify(value));
const id = () => `component_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const selected = () => !projectSelected && project?.components.find(c => c.id === selectedId);
const hierarchySelection = () => projectSelected || !project ? {kind: 'project'} : selectedId ?
  {kind: 'component', formId: project.form_id, componentId: selectedId} : {kind: 'window', formId: project.form_id};
function enqueue(action) {
  queue = queue.then(action).catch(error => { status.textContent = error.message; });
  return queue;
}
function sync({record = true} = {}) {
  const snapshot = clone(projectRoot);
  if (record) {
    const input = document.activeElement?.id;
    const group = ['event-source', 'window-imports'].includes(input) ?
      JSON.stringify([input, project?.form_id, tabs.active?.componentId, tabs.handler.value]) : null;
    projectHistory.record(snapshot, group); actions.refresh();
  }
  return enqueue(() => viperHost.request('update', {project: snapshot}));
}
function inspector() {
  if (!projectRoot) return;
  appearanceInspector.refresh();
  const rootSelected = projectSelected || !project;
  document.getElementById('project-properties').hidden = !rootSelected;
  for (const field of ['name', 'description']) {
    const input = document.getElementById(`project-${field}`); input.value = projectRoot[field]; input.disabled = preview;
  }
  const startup = document.getElementById('project-startup');
  startup.replaceChildren(...projectRoot.windows.map(form => new Option(form.window.name, form.form_id)));
  if (!projectRoot.windows.length) startup.appendChild(new Option('No windows', ''));
  startup.value = projectRoot.startup_window_id || ''; startup.disabled = preview || !projectRoot.windows.length;
  const component = selected();
  document.getElementById('link-properties').hidden = !project || rootSelected || tabs.isEvents();
  document.getElementById('window-properties').hidden = rootSelected || !!component || !!linkEditor.selected;
  document.getElementById('component-properties').hidden = rootSelected || !component;
  if (!project) return;
  for (const [field, property] of Object.entries(windowFields)) {
    const input = document.getElementById(`window-${field}`);
    if (input.type === 'checkbox') input.checked = project.window[property];
    else input.value = project.window[property];
    input.disabled = preview || tabs.isEvents();
  }
  for (const dimension of ['width', 'height']) {
    const input = document.getElementById(`window-${dimension}`);
    input.value = project[`canvas_${dimension}`]; input.disabled = preview || tabs.isEvents();
  }
  document.getElementById('window-icon').disabled = preview || tabs.isEvents();
  document.getElementById('clear-window-icon').disabled = preview || tabs.isEvents() || !project.window.icon;
  const imports = document.getElementById('window-imports');
  if (imports.value !== (project.imports || '')) imports.value = project.imports || '';
  imports.disabled = preview || tabs.isEvents();
  for (const field of fields) {
    const input = document.getElementById(`component-${field}`);
    input.disabled = !component || preview || tabs.isEvents();
    const rectangle = component && (relativeLayout.project === project ? relativeLayout.rectangles.get(component.id) : component.box);
    input.value = component ? (field === 'depth' ? viperComponents.depth(component) :
      rectangle && field in rectangle ? rectangle[field].toFixed(2) : component[field]) : '';
  }
}
function render() {
  previewSession?.dispose(); previewSession = null;
  workspace.classList.toggle('workspace-empty', !project);
  tabs.render();
  explorer.render();
  document.getElementById('link-properties').hidden = !project || projectSelected || tabs.isEvents();
  if (!project) { canvas.replaceChildren(); inspector(); actions.refresh(); return; }
  if (tabs.isEvents()) { inspector(); actions.refresh(); return; }
  renderWindow();
  const root = surface.prepare(projectRoot.themes?.[projectRoot.active_theme]);
  surface.background(project.window);
  surface.syncPreferences(preferences.values);
  wireApplicationSurface();
  const nodes = new Map();
  for (const component of project.components) {
    const control = viperComponents.make(component, preview, payload => {
      previewSession?.dispatch(payload);
    }, surface.themed);
    const el = preview ? control : viperDesignerComponents.wrap(control, component, canvas, {
      scale: () => surface.themed ? 1 : windowScale,
      anchor: (body, edge) => linkEditor.anchor(body, edge),
      rectangle: body => relativeLayout.rectangles.get(body),
      move(body, bounds, edge) {
        if (!edge) bounds = preferences.snap(body, bounds, relativeLayout.rectangles, canvas.clientWidth, canvas.clientHeight, windowScale);
        try { relativeLayout.move(body, bounds); } catch (error) { status.textContent = error.message; }
      },
      sizeMode(body, mode) {
        const component = project.components.find(c => c.id === body), previous = component.size_mode;
        component.size_mode = mode;
        try { ViperAnchorLayout.solve(project, canvas.clientWidth, canvas.clientHeight); }
        catch (error) { component.size_mode = previous; status.textContent = error.message; return; }
        render(); sync();
      },
      inspect: inspector,
      select: selectComponent,
      events: openElementEvents,
      changed() { render(); sync(); }
    });
    root.appendChild(el);
    nodes.set(component.id, el);
    el.classList.toggle('selected', !preview && component.id === selectedId);
  }
  relativeLayout.bind(project, nodes);
  if (preview) previewSession = new ViperControlSession(project, nodes, payload => {
    const request = queue.then(() => viperHost.request('event', payload));
    queue = request.catch(() => {}); return request;
  }, error => { status.textContent = error.message; });
  linkEditor.bind(project, relativeLayout, preview);
  inspector();
  actions.refresh();
}
function wireApplicationSurface() {
  if (!surface.themed) return;
  const root = surface.root, doc = root.ownerDocument;
  root.addEventListener('click', event => {
    if (suppressBoardClick) { suppressBoardClick = false; return; }
    if (event.target === root) selectWindow();
  });
  doc.addEventListener('contextmenu', event => menus.applicationContext(event));
  doc.addEventListener('keydown', event => {
    if (event.key === 'F10' || event.altKey || (menus.popups.length && ['Escape', 'Tab'].includes(event.key))) {
      const forwarded = new KeyboardEvent('keydown', {key:event.key, altKey:event.altKey, ctrlKey:event.ctrlKey,
        shiftKey:event.shiftKey, metaKey:event.metaKey, bubbles:true, cancelable:true});
      document.dispatchEvent(forwarded);
      if (forwarded.defaultPrevented) event.preventDefault();
    } else menus.applicationKey(event);
  });
  doc.addEventListener('pointerdown', () => menus.close(false), true);
  doc.addEventListener('wheel', event => {
    event.preventDefault(); const point = surface.parentPoint(event, windowScale);
    viewport.dispatchEvent(new WheelEvent('wheel', {clientX:point.x, clientY:point.y,
      deltaX:event.deltaX, deltaY:event.deltaY, deltaMode:event.deltaMode, cancelable:true}));
  }, {passive:false});
  const forwardPointer = (target, event) => {
    const point = surface.parentPoint(event, windowScale);
    target.dispatchEvent(new PointerEvent(event.type, {pointerId:event.pointerId, button:event.button,
      buttons:event.buttons, clientX:point.x, clientY:point.y, bubbles:true, cancelable:true}));
  };
  root.addEventListener('pointerdown', event => {
    if (event.target !== root) return;
    event.preventDefault(); forwardPointer(viewport, event); root.setPointerCapture(event.pointerId);
  });
  for (const type of ['pointermove', 'pointerup']) doc.addEventListener(type, event => {
    if (panGesture) forwardPointer(document, event);
  });
  doc.addEventListener('pointercancel', () => { panGesture = null; viewport.classList.remove('is-panning'); });
  root.addEventListener('dragover', event => { if (!preview) event.preventDefault(); });
  root.addEventListener('drop', event => {
    event.preventDefault(); add(event.dataTransfer.getData('text/plain'),
      event.clientX * 100 / canvas.clientWidth, event.clientY * 100 / canvas.clientHeight);
  });
}
function selectComponent(componentId) {
  if (preview || !project?.components.some(component => component.id === componentId)) return;
  linkEditor.clearSelection();
  selectedId = componentId; projectSelected = false; inspector(); frame.classList.remove('selected');
  surface.root.querySelectorAll('.component-wrapper').forEach(node =>
    node.classList.toggle('selected', node.dataset.id === componentId));
  explorer.reveal(hierarchySelection()); explorer.render(); actions.refresh();
}
function add(kind, x, y) {
  if (preview || projectSelected || tabs.isEvents() || !project || !library?.[kind]) return;
  const component = clone(library[kind]);
  component.id = id(); component.visible = true; component.enabled = true; component.event_handlers = {};
  component.layout.min_width = 80; component.layout.min_height = 32;
  if (x !== undefined) { component.layout.x = Math.min(x, 100 - component.layout.width);
    component.layout.y = Math.min(y, 100 - component.layout.height); }
  project.components.push(component); selectedId = component.id; explorer.reveal(hierarchySelection()); render(); sync();
}
for (const item of document.querySelectorAll('.tool-item')) {
  item.draggable = true;
  item.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', item.dataset.kind));
}
canvas.addEventListener('dragover', event => { if (!preview) event.preventDefault(); });
canvas.addEventListener('drop', event => {
  event.preventDefault(); const kind = event.dataTransfer.getData('text/plain');
  if (!library || !library[kind]) return;
  const rect = canvas.getBoundingClientRect();
  add(kind, (event.clientX - rect.left) * 100 / rect.width,
    (event.clientY - rect.top) * 100 / rect.height);
});
for (const field of fields) document.getElementById(`component-${field}`).addEventListener('change', event => {
  const component = selected(); if (!component || preview || tabs.isEvents()) return;
  if (field === 'depth') {
    const depth = Number(event.target.value);
    if (!Number.isInteger(depth) || depth < 0 || depth > 4) { inspector(); return; }
    component.depth = depth;
  } else if (['x', 'y', 'width', 'height'].includes(field)) {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    const rectangle = {...relativeLayout.rectangles.get(component.id)};
    rectangle[field] = field === 'width' || field === 'height' ? Math.max(component.layout[`min_${field}`], value) : value;
    try { relativeLayout.move(component.id, rectangle); }
    catch (error) { status.textContent = error.message; return; }
  } else component[field] = event.target.value;
  render(); sync();
});
function remove() { if (preview || projectSelected || !project || tabs.isEvents()) return;
  if (linkEditor.removeSelected()) return;
  if (!selected()) return deleteWindow();
  project.links = project.links.filter(l => l.a.body !== selectedId && l.b.body !== selectedId);
  project.components = project.components.filter(c => c.id !== selectedId); selectedId = null;
  explorer.reveal(hierarchySelection()); render(); sync(); }
function duplicate() {
  if (preview || !selected()) return;
  const copy = clone(selected()); copy.id = id(); copy.name += ' Copy';
  project.components.push(copy); selectedId = copy.id; explorer.reveal(hierarchySelection()); render(); sync();
}
function replaceProject(next) {
  projectRoot = next;
  for (const form of next.windows) relativeLayout.initialize(form);
  project = next.windows.find(form => form.form_id === next.startup_window_id);
  projectSelected = !project; selectedId = null; preview = false; stagePosition = null; zoom = 1;
  formViews.clear(); tabs.reset(); explorer.reset();
  linkEditor.setConnecting(false); render(); projectHistory.reset(projectRoot); actions.refresh();
}
function stepHistory(redo = false) {
  if (preview || !projectRoot) return;
  sync();
  const next = projectHistory.step(redo); if (!next) return;
  const previousForm = project?.form_id;
  projectRoot = next;
  project = next.windows.find(form => form.form_id === previousForm) ||
    next.windows.find(form => form.form_id === next.startup_window_id);
  if (!project?.components.some(component => component.id === selectedId)) selectedId = null;
  if (previousForm !== project?.form_id) { stagePosition = null; zoom = 1; }
  tabs.documents = tabs.documents.filter(doc => next.windows.some(form => form.form_id === doc.formId &&
    (!doc.componentId || form.components.some(component => component.id === doc.componentId))));
  if (!tabs.documents.includes(tabs.active)) {
    let doc = tabs.documents.find(doc => doc.formId === project?.form_id && !doc.componentId);
    if (!doc && project) { doc = {key: `form:${project.form_id}`, formId: project.form_id}; tabs.documents.push(doc); }
    tabs.active = doc || null;
  }
  projectSelected = !project || projectSelected;
  linkEditor.clearSelection(); linkEditor.setConnecting(false);
  render(); sync({record: false});
  status.textContent = redo ? 'Redo' : 'Undo';
}
const tabs = new ViperDesignerTabs({
  root: () => projectRoot,
  preview: () => preview,
  imports(formId) {
    tabs.showForm(formId); selectWindow(); showProperties(); document.getElementById('window-imports').focus();
  },
  activate(formId) {
    if (project && projectRoot.windows.includes(project)) formViews.set(project.form_id, {selectedId, zoom, stagePosition});
    project = projectRoot.windows.find(form => form.form_id === formId);
    const view = formViews.get(formId) || {selectedId: null, zoom: 1, stagePosition: null};
    selectedId = tabs.active?.componentId || view.selectedId; projectSelected = !project; zoom = view.zoom; stagePosition = view.stagePosition;
    if (!project?.components.some(component => component.id === selectedId)) selectedId = null;
    preview = false; linkEditor.setConnecting(false); linkEditor.selected = null;
    explorer.reveal(hierarchySelection()); render();
  },
  changed: sync
});
function newWindow() {
  if (!projectRoot || preview) return;
  let number = 2;
  const names = new Set(projectRoot.windows.map(form => form.window.name));
  while (names.has(`Window${number}`)) number++;
  const name = projectRoot.windows.length ? `Window${number}` : 'MainWindow';
  const form = {...clone(windowDefaults), form_id: `form_${id()}`};
  form.window.name = name; form.window.title = name;
  form.canvas_width = Math.max(form.canvas_width, form.window.min_width);
  form.canvas_height = Math.max(form.canvas_height, form.window.min_height);
  projectRoot.windows.push(form);
  projectRoot.startup_window_id ||= form.form_id;
  const doc = {key: `form:${form.form_id}`, formId: form.form_id}; tabs.documents.push(doc); tabs.activate(doc); sync();
}
function openElementEvents(componentId = selectedId) {
  if (preview || !project?.components.some(c => c.id === componentId)) return;
  selectedId = componentId; projectSelected = false; tabs.openEvents(project.form_id, componentId);
}
function selectHierarchy(item) {
  if (preview) return;
  if (item.kind === 'project') { linkEditor.clearSelection(); projectSelected = true; selectedId = null; render(); return; }
  tabs.showForm(item.formId);
  if (item.kind === 'component') selectComponent(item.componentId); else selectWindow();
}
function deleteWindow() {
  if (!project || projectSelected || preview) return;
  const form = project;
  if (!confirm(`Delete window "${form.window.name}" and its ${form.components.length} component(s)? Event source will be preserved.`)) return;
  projectRoot.windows = projectRoot.windows.filter(item => item.form_id !== form.form_id);
  if (projectRoot.startup_window_id === form.form_id) projectRoot.startup_window_id = projectRoot.windows[0]?.form_id || null;
  formViews.delete(form.form_id);
  tabs.documents = tabs.documents.filter(doc => doc.formId !== form.form_id);
  const next = tabs.documents.at(-1);
  if (next) tabs.activate(next);
  else if (projectRoot.windows.length) tabs.showForm(projectRoot.startup_window_id);
  else tabs.activate(null);
  sync(); status.textContent = `Deleted ${form.window.name}`;
}
function setStartupWindow() {
  if (!project || preview) return;
  projectRoot.startup_window_id = project.form_id; render(); sync();
}
const explorer = new ViperProjectExplorer(document.getElementById('project-tree'), {
  root: () => projectRoot, selection: hierarchySelection, editable: () => !preview,
  select: selectHierarchy,
  events(item) { selectHierarchy(item); if (!preview) openElementEvents(item.componentId); },
  properties(item) { selectHierarchy(item); showProperties(); },
  context(item, x, y, focus) {
    const items = item.kind === 'project' ? ['new-window', 'rename-selection', 'show-properties'] : item.kind === 'window' ?
      ['new-window', 'rename-selection', 'set-startup-window', null, 'delete', 'show-properties'] :
      ['edit-events', 'rename-selection', 'duplicate', 'delete', null, 'show-properties'];
    menus.context(items, x, y, focus);
  }
});
document.getElementById('add-window').onclick = () => actions.execute('new-window');
function newProject() {
  if (projectRoot && !confirm('Replace the current project? Save your changes first.')) return;
  return enqueue(async () => { replaceProject(await viperHost.request('new')); status.textContent = 'New project'; });
}
function saveProject(saveAs = false) {
  // Commit a pending Inspector change before capturing the save snapshot.
  const input = document.activeElement;
  if (input?.matches('input:not([type=file]), select')) input.dispatchEvent(new Event('change', {bubbles: true}));
  sync(); return enqueue(async () => { const result = await viperHost.request(saveAs ? 'save-as' : 'save');
    projectHistory.group = null;
    status.textContent = result.cancelled ? 'Save cancelled' : 'Project saved'; });
}
function openProject() {
  if (projectRoot && !confirm('Open another project? Save your changes first.')) return;
  return enqueue(async () => { const result = await viperHost.request('open');
    if (result.project) { replaceProject(result.project); status.textContent = 'Project opened'; } });
}
function togglePreview() {
  if (projectSelected && projectRoot.startup_window_id) tabs.showForm(projectRoot.startup_window_id);
  if (!project) return;
  sync(); enqueue(() => viperHost.request('reset-preview'));
  if (tabs.isEvents()) tabs.showForm(project.form_id);
  preview = !preview;
  if (preview) linkEditor.setConnecting(false);
  render(); status.textContent = preview ? 'Preview: interact with controls' : 'Design mode';
}
function runProject() {
  const windowId = projectSelected || !project ? projectRoot.startup_window_id : project.form_id;
  sync(); return enqueue(async () => { await viperHost.request('run', {window_id: windowId}); status.textContent = 'Application process started'; });
}
const exportDialog = document.getElementById('export-options');
const exportFormat = document.getElementById('export-format');
function chooseExport() {
  if (!building && !exportDialog.open) exportDialog.showModal();
}
exportFormat.onchange = () => {
  document.getElementById('export-format-help').textContent = exportFormat.value === 'python' ?
    'Includes app.py and requirements.txt. Install the dependencies once, then run py app.py. No Viper installation needed.' :
    'Includes Python and the application runtime. Extract the ZIP and run the .exe. Requires Windows and WebView2.';
};
document.getElementById('cancel-export').onclick = () => exportDialog.close();
document.getElementById('export-form').onsubmit = event => {
  event.preventDefault();
  const format = exportFormat.value;
  exportDialog.close(); buildProject(format);
};
function buildProject(format = 'exe') {
  if (building) return buildTask;
  building = true; actions.refresh();
  status.textContent = 'Preparing application package…';
  sync();
  buildTask = (async () => {
    try {
      const result = await enqueue(() => viperHost.request('build', {format}));
      if (!result) return;
      if (result.cancelled) { status.textContent = 'Build cancelled'; return; }
      for (;;) {
        const job = await viperHost.request('build-status', {job_id: result.job_id});
        if (job.state === 'complete') { status.textContent = 'Build complete'; return; }
        if (job.state === 'failed') throw new Error(job.message);
        status.textContent = `Building application: ${job.message}`;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) { status.textContent = `Build failed: ${error.message}`; }
    finally { building = false; actions.refresh(); }
  })();
  return buildTask;
}
function applyPreferences() {
  const values = preferences.values;
  workspace.classList.toggle('grid-hidden', !values.showGrid);
  workspace.classList.toggle('anchors-hidden', !values.showAnchors);
  surface.syncPreferences(values);
  if (panels && panels.isOpen('inspector') !== values.properties) panels.toggle('inspector');
  canvas.style.backgroundSize = `${values.gridSize}px ${values.gridSize}px`;
  viewport.style.backgroundSize = `${values.gridSize * 2}px ${values.gridSize * 2}px`;
  actions.refresh();
}
function showProperties() {
  panels.show('inspector');
  document.getElementById(projectSelected || !project ? 'project-name' : selected() ? 'component-name' : 'window-name').focus();
}
const gridSettings = document.getElementById('grid-settings');
const appearanceInspector = new ViperAppearanceInspector({
  root: () => projectRoot, selected, editable: () => !preview && !tabs.isEvents(),
  form: () => project, surface: () => surface,
  control() {
    const node = relativeLayout.nodes.get(selectedId);
    return node?.classList.contains('component-wrapper') ? node.firstElementChild : node;
  },
  changed() { render(); sync(); }, request: (command, payload) => viperHost.request(command, payload),
  status(message) { status.textContent = message; }
});
function closeGridSettings() { gridSettings.hidden = true; }
panels = new ViperDesignerWorkspace(workspace, [
  {id: 'project', title: 'Project Explorer', element: document.getElementById('project-tool'), location: 'left', visible: true},
  {id: 'components', title: 'Components', element: document.getElementById('components-tool'), location: 'left'},
  {id: 'inspector', title: 'Inspector', element: document.getElementById('inspector-tool'), location: 'right'}
], {
  storage: preferenceStorage, inspectorVisible: preferences.values.properties,
  changed() {
    if (!panels) return;
    if (preferences.values.properties !== panels.isOpen('inspector')) preferences.set('properties', panels.isOpen('inspector'));
    actions.refresh(); renderWindow();
  }
});
preferences.set('properties', panels.isOpen('inspector'));
const menus = createViperDesignerChrome(actions, {
  canvas, surface, scale: () => windowScale, newProject, openProject, saveProject, newWindow, duplicate, remove, add, select: selectComponent,
  undo: () => stepHistory(), redo: () => stepHistory(true),
  setStartupWindow, rename() { showProperties(); document.activeElement.select(); },
  events: () => openElementEvents(),
  toggleTool: tool => panels.toggle(tool), resetWorkspace: () => panels.reset(),
  preview: togglePreview, run: runProject, build: chooseExport, preferencesChanged: applyPreferences,
  windowProperties() { selectWindow(); showProperties(); }, properties: showProperties,
  connect() {
    if (!linkEditor.connecting) { preferences.set('showAnchors', true); applyPreferences(); }
    linkEditor.setConnecting(!linkEditor.connecting);
  },
  gridSettings() { gridSettings.hidden = false; document.getElementById('grid-size').value = preferences.values.gridSize;
    document.getElementById('grid-size').focus(); },
  zoom(factor) { zoom = factor === null ? 1 : Math.max(.2, Math.min(5, zoom * factor)); stagePosition = null; renderWindow(); },
  escape() { closeGridSettings(); linkEditor.setConnecting(false); }
}, {
  hasProject: () => !!projectRoot, hasWindow: () => !!project, hasSelection: () => !!selected(), hasWidget: kind => !!library?.[kind],
  canUndo: () => projectHistory.canUndo, canRedo: () => projectHistory.canRedo,
  projectSelected: () => projectSelected, hasWindows: () => !!projectRoot?.windows.length,
  startupSelected: () => projectRoot?.startup_window_id === project?.form_id,
  preview: () => preview, building: () => building, connecting: () => linkEditor.connecting, events: () => tabs.isEvents(),
  toolOpen: tool => panels.isOpen(tool)
}, preferences);
actions.subscribe(() => {
  for (const [element, action] of [['explorer-new-window', 'new-window'], ['explorer-rename', 'rename-selection'],
    ['explorer-delete', 'delete'], ['empty-new-window', 'new-window']]) document.getElementById(element).disabled = !actions.state(action).enabled;
});
for (const [element, action] of [['explorer-new-window', 'new-window'], ['explorer-rename', 'rename-selection'],
  ['explorer-delete', 'delete'], ['empty-new-window', 'new-window']]) document.getElementById(element).onclick = () => actions.execute(action);
document.getElementById('open-project-explorer').onclick = () => panels.show('project');
for (const field of ['name', 'description']) document.getElementById(`project-${field}`).onchange = event => {
  if (!projectRoot || preview) return;
  const value = field === 'name' ? event.target.value.trim() : event.target.value;
  if (field === 'name' && !value) { inspector(); status.textContent = 'Project name cannot be empty'; return; }
  projectRoot[field] = value; render(); sync();
};
document.getElementById('project-startup').onchange = event => {
  if (preview || !projectRoot.windows.some(form => form.form_id === event.target.value)) return;
  projectRoot.startup_window_id = event.target.value; render(); sync();
};
document.getElementById('close-grid-settings').onclick = closeGridSettings;
document.getElementById('apply-grid-settings').onclick = () => {
  const input = document.getElementById('grid-size');
  if (!input.reportValidity()) return;
  preferences.set('gridSize', Number(input.value)); applyPreferences(); closeGridSettings();
};
applyPreferences(); render();
new ResizeObserver(() => { if (project) renderWindow(); }).observe(viewport);

const windowImportsInput = document.getElementById('window-imports');
windowImportsInput.addEventListener('input', () => {
  if (!project || preview || tabs.isEvents()) return;
  project.imports = windowImportsInput.value; sync();
});
windowImportsInput.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  windowImportsInput.setRangeText('    ', windowImportsInput.selectionStart, windowImportsInput.selectionEnd, 'end');
  windowImportsInput.dispatchEvent(new Event('input'));
});

for (const [field, property] of Object.entries(windowFields)) {
  document.getElementById(`window-${field}`).addEventListener('change', event => {
    if (preview) return;
    const input = event.target;
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (property === 'min_width' || property === 'min_height') {
      value = Math.max(property === 'min_width' ? 100 : 60, Math.min(property === 'min_width' ? 7680 : 4320, Number(value)));
      if (!Number.isFinite(value)) return;
      value = Math.round(value);
    }
    project.window[property] = value;
    project.canvas_width = Math.max(project.canvas_width, project.window.min_width);
    project.canvas_height = Math.max(project.canvas_height, project.window.min_height);
    render(); sync();
  });
}
for (const dimension of ['width', 'height']) {
  document.getElementById(`window-${dimension}`).addEventListener('change', event => {
    if (preview) return;
    const value = Number(event.target.value); if (!Number.isFinite(value)) return;
    project[`canvas_${dimension}`] = Math.round(Math.max(project.window[`min_${dimension}`], Math.min(dimension === 'width' ? 7680 : 4320, value)));
    render(); sync();
  });
}
document.getElementById('window-icon').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file || preview) return;
  const currentProject = project;
  try {
    if (file.size > 1024 * 1024) throw new Error('Choose an icon smaller than 1 MB.');
    const image = new Image(); const url = URL.createObjectURL(file);
    try {
      image.src = url; await image.decode();
      const bitmap = document.createElement('canvas'); bitmap.width = bitmap.height = 32;
      const factor = Math.min(32 / image.width, 32 / image.height);
      bitmap.getContext('2d').drawImage(image, (32 - image.width * factor) / 2,
        (32 - image.height * factor) / 2, image.width * factor, image.height * factor);
      if (project !== currentProject) return;
      project.window.icon = bitmap.toDataURL('image/png'); render(); sync();
      status.textContent = 'Window icon updated';
    } finally { URL.revokeObjectURL(url); }
  } catch (error) { status.textContent = `Cannot load icon: ${error.message}`; }
  finally { event.target.value = ''; }
});
document.getElementById('clear-window-icon').onclick = () => {
  if (preview) return; project.window.icon = ''; render(); sync();
};
document.getElementById('window-resize').addEventListener('pointerdown', event => {
  if (preview || event.button !== 0) return;
  event.preventDefault();
  const handle = event.target, width = project.canvas_width, height = project.canvas_height;
  const x = event.clientX, y = event.clientY, scale = windowScale;
  handle.setPointerCapture(event.pointerId);
  function move(e) {
    project.canvas_width = Math.round(Math.max(project.window.min_width, Math.min(7680, width + (e.clientX - x) / scale)));
    project.canvas_height = Math.round(Math.max(project.window.min_height, Math.min(4320, height + (e.clientY - y) / scale)));
    render();
  }
  function end() {
    handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end); sync();
  }
  handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
});
viperHost.request('bootstrap').then(data => {
  library = data.library; windowDefaults = data.window_defaults;
  appearanceInspector.library = data.themes || [];
  document.getElementById('theme-directory').textContent = `Theme folder: ${data.theme_directory}`;
  replaceProject(data.project); status.textContent = projectRoot.name;
}).catch(error => { status.textContent = error.message; });
