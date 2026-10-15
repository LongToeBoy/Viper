/* Integration checks in the native designer, including actual Python dispatch. */
(async () => {
  const original = clone(projectRoot);
  let checks = 0;
  const assert = (condition, message) => { if (!condition) throw new Error(message); checks++; };
  const change = (input, value) => { input.value = value; input.dispatchEvent(new Event('change', {bubbles: true})); };
  try {
    assert(document.querySelectorAll('#document-tabs [role=tab]').length === 1 && !tabs.isEvents(), 'Startup has one visual form tab');
    const first = project, component = project.components[0];
    selectComponent(component.id);
    zoom = 1.4; stagePosition = {x: 12, y: 24}; renderWindow();
    const clicked = canvas.querySelector('.component-wrapper.selected');
    clicked.setPointerCapture = () => {}; clicked.hasPointerCapture = () => false;
    clicked.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 41, button: 0, clientX: 100, clientY: 100, bubbles: true}));
    clicked.dispatchEvent(new PointerEvent('pointerup', {pointerId: 41, clientX: 100, clientY: 100, bubbles: true}));
    assert(canvas.querySelector('.component-wrapper.selected') === clicked, 'Plain click retains the node for browser double-click recognition');
    clicked.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    assert(tabs.isEvents() && viewport.hidden && !document.getElementById('event-editor').hidden, 'Double-click opens event editor');
    assert(!actions.state('duplicate').enabled && !actions.state('connect-links').enabled, 'Events tab disables canvas editing');
    const source = document.getElementById('event-source'), handlerInput = document.getElementById('event-handler');
    document.getElementById('create-event-handler').click();
    const handlerName = component.event_handlers.click;
    assert(handlerName && source.value.includes(`def ${handlerName}(event):`), 'Create connects a Python handler');
    const authored = `# User code\ndef ${handlerName}(event):\n    return "handled:" + event["value"]\n`;
    source.value = authored; source.dispatchEvent(new Event('input', {bubbles: true}));
    document.getElementById('create-event-handler').click();
    assert(projectRoot.event_code[handlerName] === authored, 'Create never overwrites authored source');
    await queue;
    const response = await viperHost.request('event', {window_id: 'main', component_id: component.id, event: 'click', value: 'test'});
    assert(response.handled && response.value === 'handled:test', 'Editor source executes through shared Python event API');
    tabs.showForm('main');
    assert(zoom === 1.4 && stagePosition.x === 12 && selectedId === component.id, 'Form view and selection survive event editing');
    openElementEvents(component.id); openElementEvents(component.id);
    assert(document.querySelectorAll('#document-tabs [role=tab]').length === 2 && source.value === authored, 'Repeated opening reuses the event tab and source');
    const events = document.getElementById('event-kind'); change(events, 'change');
    document.getElementById('create-event-handler').click();
    const changeName = component.event_handlers.change;
    assert(changeName !== handlerName && projectRoot.event_code[handlerName] === authored, 'Each event retains its own code');
    tabs.showForm('main'); openElementEvents(component.id);
    assert(events.value === 'change', 'Event choice survives switching tabs');
    tabs.close(tabs.active); openElementEvents(component.id); change(events, 'click');
    assert(source.value === authored, 'Closing and reopening an event tab preserves code');
    tabs.showForm('main');
    change(document.getElementById('component-name'), 'Renamed button');
    duplicate();
    assert(selected().event_handlers.click === handlerName && projectRoot.event_code[handlerName] === authored, 'Rename and duplicate preserve user source');
    const mainCount = first.components.length;
    document.getElementById('add-window').click();
    const second = project;
    assert(projectRoot.windows.length === 2 && second !== first && second.components.length === 0, 'Plus creates a separate empty form');
    assert(document.querySelectorAll('#document-tabs [role=tab]').length === 3, 'New form gets its own tab');
    add('text_input');
    const inputComponent = selected();
    change(document.getElementById('window-caption'), 'Second form title');
    assert(second.window.title === 'Second form title' && first.components.length === mainCount, 'Second form properties and components are independent');
    openElementEvents(inputComponent.id);
    assert(events.value === 'change', 'Text input defaults to change event');
    document.getElementById('create-event-handler').click();
    const secondHandler = inputComponent.event_handlers.change;
    source.value = `def ${secondHandler}(event):\n    return event["window_id"]\n`; source.dispatchEvent(new Event('input'));
    await queue;
    const secondResponse = await viperHost.request('event', {window_id: second.form_id, component_id: inputComponent.id, event: 'change', value: 'value'});
    assert(secondResponse.value === second.form_id, 'Secondary form dispatch identifies its own window');
    const originalRequest = viperHost.request; let requestedWindow;
    try {
      viperHost.request = (command, payload) => command === 'run' ?
        (requestedWindow = payload.window_id, Promise.resolve({started: true})) : originalRequest(command, payload);
      await runProject();
      assert(requestedWindow === second.form_id, 'Run from Events opens the owning form');
    } finally { viperHost.request = originalRequest; }
    actions.execute('preview');
    assert(preview && !tabs.isEvents() && !canvas.querySelector('.component-wrapper') && canvas.querySelector('input.component'), 'Preview from Events shows the owning form controls');
    actions.execute('stop');
    tabs.showForm('main');
    assert(project === first && first.components.length === mainCount && projectRoot.windows[1].components.length === 1, 'Tab switch preserves both forms');
    await sync();
    const saved = (await viperHost.request('bootstrap')).project;
    assert(saved.windows.length === 2 && saved.windows[1].window.title === 'Second form title' && saved.event_code[handlerName] === authored, 'Bridge snapshot contains every form and verbatim source');
    replaceProject(saved);
    assert(document.querySelectorAll('#document-tabs [role=tab]').length === 1 && !tabs.isEvents(), 'Reopening opens only the startup form');
    openElementEvents(project.components.find(c => c.id === component.id).id);
    assert(source.value === authored, 'Reopened project restores source without regeneration');
    const focusTab = document.querySelector('#document-tabs [role=tab][aria-selected=true]'); focusTab.focus();
    focusTab.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true, cancelable: true}));
    assert(!tabs.isEvents() && document.activeElement.getAttribute('aria-selected') === 'true', 'Tab keyboard navigation activates and focuses forms');
    return {passed: checks};
  } catch (error) { return {passed: checks, error: error.message, stack: error.stack}; }
  finally { replaceProject(original); await sync(); }
})()
