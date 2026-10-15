(async () => {
  const original = clone(projectRoot);
  let passed = 0;
  const assert = (condition, message) => { if (!condition) throw new Error(message); passed++; };
  const imports = document.getElementById('window-imports');
  const edit = value => { imports.value = value; imports.dispatchEvent(new Event('input', {bubbles:true})); };
  try {
    if (preview) togglePreview();
    const first = project, button = project.components[0];
    openElementEvents(button.id);
    assert(!document.getElementById('event-controls-help') && !document.getElementById('event-editor').textContent.includes('Write a Python function'), 'Events editor no longer shows explanatory hint paragraphs');
    document.getElementById('edit-window-imports').click();
    assert(!tabs.isEvents() && !selectedId && !projectSelected && document.activeElement === imports, 'Events toolbar opens imports for the owning window');
    assert(!document.getElementById('window-properties').hidden && !imports.disabled, 'Imports belong to window properties');
    const source = '# shared by this window\nfrom fractions import Fraction as F\n';
    edit(source); await sync();
    assert(project.imports === source, 'Editing imports updates the window definition');
    first.components[0].event_handlers.click = 'window_import_click';
    const handler = 'def window_import_click(event):\n    StatusLabel.Text = "Imported " + str(F(1, 2))\n';
    projectRoot.event_code.window_import_click = handler;
    await sync(); togglePreview();
    const launch = relativeLayout.nodes.get(button.id); launch.click(); await previewSession.pending;
    const label = relativeLayout.nodes.get(first.components.find(component => component.name === 'StatusLabel').id);
    assert(label.textContent === 'Imported 1/2', 'Preview handlers can use the window import alias');
    assert(imports.disabled, 'Window imports are read-only during Preview');
    togglePreview(); await queue;
    newWindow(); const second = project;
    assert(second.imports === '' && imports.value === '', 'New sibling windows have independent empty imports');
    edit('import calendar as shared\n'); await sync();
    tabs.showForm(first.form_id); selectWindow();
    assert(imports.value === source && first.imports !== second.imports, 'Window switching restores each import block');
    assert(projectRoot.event_code.window_import_click === handler, 'Import edits never rewrite event source');
    const saved = (await viperHost.request('bootstrap')).project;
    replaceProject(saved); selectWindow();
    assert(project.imports === source && imports.value === source, 'Saved window imports reopen verbatim');
    return {passed};
  } catch (error) { return {passed, error:error.stack || error.message}; }
  finally { replaceProject(original); await sync(); }
})()
