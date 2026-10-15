/* Runs against the real bridge and a temporary, deterministic native file picker. */
(async () => {
  const original = clone(projectRoot), originalConfirm = window.confirm;
  let passed = 0;
  const assert = (value, message) => { if (!value) throw new Error(message); passed++; };
  const state = () => viperHost.request('document-state');
  const key = (target, key, options = {}) => {
    const event = new KeyboardEvent('keydown', {key, bubbles:true, cancelable:true, ...options});
    target.dispatchEvent(event); return event;
  };
  try {
    window.confirm = () => true;
    replaceProject(clone(original)); await sync();
    assert(!(await state()).dirty && !actions.state('undo').enabled, 'Opening a document starts clean without history');
    const source = '# exact unfinished draft\ndef unfinished(\n';
    const history = new ViperProjectHistory(2, 1000);
    history.reset({source, value:0}); history.record({source, value:1}, 'typing'); history.record({source, value:2}, 'typing');
    assert(history.past.length === 1 && history.step().value === 0 && history.step(true).source === source,
      'Typing groups preserve exact source and share one undo step');
    history.record({source, value:3}); history.record({source, value:4}); history.record({source, value:5});
    assert(history.past.length === 2 && !history.canRedo, 'History is bounded and new edits discard redo');

    await saveProject();
    let metadata = await state();
    assert(metadata.path === /*FIRST_PATH*/ && !metadata.dirty && !metadata.title.includes('*'), 'First Save sets the path and clean title');
    const count = project.components.length;
    selectComponent(project.components[0].id); actions.execute('duplicate'); await queue;
    const copyId = selectedId;
    assert((await state()).dirty && (await state()).title.includes('*') && actions.state('undo').enabled,
      'A project edit updates the native title and enables Undo');
    key(canvas, 'z', {ctrlKey:true}); await queue;
    assert(project.components.length === count && !(await state()).dirty && actions.state('redo').enabled,
      'Ctrl+Z returns to the save checkpoint and removes the star');
    key(canvas, 'z', {ctrlKey:true,shiftKey:true}); await queue;
    assert(project.components.some(c => c.id === copyId) && (await state()).dirty, 'Ctrl+Shift+Z restores the same component identity');
    await saveProject();
    assert(!(await state()).dirty && actions.state('undo').enabled, 'Saving retains history and updates the checkpoint');
    actions.execute('undo'); await queue;
    assert((await state()).dirty, 'Undo away from a saved revision adds the star');
    actions.execute('redo'); await queue;
    assert(!(await state()).dirty, 'Redo back to the saved contents clears the star');
    await saveProject(true);
    assert((await state()).path === /*FIRST_PATH*/ && status.textContent === 'Save cancelled', 'Cancelled Save As retains the destination');
    await saveProject(true);
    assert((await state()).path === /*SECOND_PATH*/ && !(await state()).dirty, 'Successful Save As changes the current destination');
    selectComponent(copyId);
    const field = document.getElementById('component-text'); field.focus(); field.value = 'Saved pending Inspector value';
    key(field, 's', {ctrlKey:true}); await queue;
    assert(selected().text === 'Saved pending Inspector value' && !(await state()).dirty,
      'Ctrl+S commits a pending Inspector edit before writing without moving focus');
    assert(document.activeElement === field && !key(field, 'z', {ctrlKey:true}).defaultPrevented,
      'Text fields retain focus and native undo shortcuts');

    selectComponent(project.components[0].id);
    const id = selectedId, before = {...relativeLayout.rectangles.get(id)}, steps = projectHistory.past.length;
    for (let i=1;i<=10;i++) relativeLayout.move(id, {...before,x:before.x+i,y:before.y+i});
    await sync();
    assert(projectHistory.past.length === steps+1, 'A completed move is one history operation');
    actions.execute('undo'); await queue;
    assert(JSON.stringify(relativeLayout.rectangles.get(id)) === JSON.stringify(before), 'Undo restores solved component geometry');
    actions.execute('redo'); await queue;
    assert(relativeLayout.rectangles.get(id).x === before.x+10, 'Redo reapplies the completed move');
    linkEditor.setConnecting(true); linkEditor.anchor('$window','left'); linkEditor.anchor(id,'left'); await queue;
    const link = clone(project.links.at(-1));
    actions.execute('undo'); await queue;
    assert(!project.links.some(item => item.id === link.id), 'Undo removes an authored anchor link');
    actions.execute('redo'); await queue;
    assert(JSON.stringify(project.links.at(-1)) === JSON.stringify(link), 'Redo restores exact link endpoints and scalars');
    linkEditor.select(link.id); actions.execute('delete'); await queue;
    actions.execute('undo'); await queue;
    assert(project.links.some(item => item.id === link.id), 'Undo restores a deleted link');
    selectComponent(id); actions.execute('delete'); await queue;
    actions.execute('undo'); await queue;
    assert(project.components.some(c => c.id === id) && project.links.some(item => item.id === link.id),
      'Undo restores a deleted component and its links together');

    openElementEvents(id); tabs.createHandler(); await queue;
    const handler = tabs.handler.value, prior = projectRoot.event_code[handler];
    projectHistory.group = null;
    const draft = '# User authored spacing\ndef ' + handler + '(event):\n    ';
    tabs.source.value = draft; tabs.source.dispatchEvent(new Event('input'));
    tabs.source.value = draft + 'return "kept exactly"\n'; tabs.source.dispatchEvent(new Event('input')); await queue;
    const finalSource = tabs.source.value;
    actions.execute('undo'); await queue;
    assert(projectRoot.event_code[handler] === prior && tabs.source.value === prior, 'One Undo restores the code before a typing group');
    actions.execute('redo'); await queue;
    assert(projectRoot.event_code[handler] === finalSource && tabs.source.value === finalSource, 'Redo restores Python source verbatim');
    const formId = project.form_id; tabs.showForm(formId); selectWindow();
    const imports = document.getElementById('window-imports'), previousImports = project.imports;
    imports.focus(); imports.value = '# draft\nfrom math import ('; imports.dispatchEvent(new Event('input'));
    imports.value += '\n'; imports.dispatchEvent(new Event('input')); await queue;
    const draftImports = imports.value;
    actions.execute('undo'); await queue;
    assert(project.imports === previousImports, 'Window import typing is grouped');
    actions.execute('redo'); await queue;
    assert(project.imports === draftImports, 'Incomplete import drafts survive redo unchanged');

    const historySize = projectHistory.past.length;
    actions.execute('zoom-in'); actions.execute('show-grid'); actions.execute('show-grid');
    assert(projectHistory.past.length === historySize, 'Workspace preferences and zoom stay out of project history');
    actions.execute('preview'); await queue;
    assert(!actions.state('undo').enabled && !actions.state('redo').enabled, 'Preview cannot mutate project history');
    actions.execute('stop'); await queue;
    selectWindow(); actions.execute('delete'); await queue;
    assert(!projectRoot.windows.length && actions.state('undo').enabled, 'Deleting the final form keeps Undo available');
    actions.execute('undo'); await queue;
    assert(projectRoot.windows.length === 1 && projectRoot.event_code[handler] === finalSource && project.imports === draftImports,
      'Undo restores the final form, imports, links and authored code');
    actions.execute('redo'); await queue;
    assert(!projectRoot.windows.length, 'Redo restores an empty project');
    newWindow(); await queue;
    const newId = project.form_id;
    actions.execute('undo'); await queue;
    assert(!projectRoot.windows.length && !projectRoot.startup_window_id, 'Undo New Window restores an empty startup definition');
    actions.execute('redo'); await queue;
    assert(project.form_id === newId && projectRoot.startup_window_id === newId, 'Redo New Window preserves its stable ID and startup choice');
    actions.execute('undo'); await queue;
    newWindow(); await queue;
    assert(!actions.state('redo').enabled, 'A new edit after Undo clears the redo branch');
    const firstId = projectRoot.startup_window_id;
    newWindow(); await queue;
    const secondId = project.form_id;
    setStartupWindow(); await queue;
    actions.execute('undo'); await queue;
    assert(projectRoot.startup_window_id === firstId && projectRoot.windows.length === 2 && project.form_id === secondId,
      'Undo Startup Window preserves siblings and the active document');
    actions.execute('redo'); await queue;
    assert(projectRoot.startup_window_id === secondId, 'Redo restores the configured startup form');
    selectWindow(); actions.execute('delete'); await queue;
    actions.execute('undo'); await queue;
    assert(projectRoot.windows.some(form => form.form_id === secondId) && projectRoot.startup_window_id === secondId,
      'Undo restores a deleted sibling and its startup ownership');

    await openProject();
    metadata = await state();
    assert(metadata.path === /*FIRST_PATH*/ && !metadata.dirty && !actions.state('undo').enabled && !actions.state('redo').enabled,
      'Open associates its path and resets history');
    await newProject();
    metadata = await state();
    assert(metadata.path === null && !metadata.dirty && !actions.state('undo').enabled, 'New resets file identity and history');
    return {passed, title:metadata.title};
  } catch (error) { return {passed,error:error.message,stack:error.stack}; }
  finally { window.confirm = originalConfirm; replaceProject(original); await sync(); }
})()
