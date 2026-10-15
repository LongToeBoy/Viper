/* Actual Python-to-control updates in both Preview and standalone Run. */
(async () => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const designer = typeof previewSession !== 'undefined';
  const original = designer ? clone(projectRoot) : null;
  let session, originalError, fixture;
  let checks = 0;
  const assert = (condition, message) => { if (!condition) throw new Error(message); checks++; };
  const byName = name => project.components.find(component => component.name === name);
  const node = name => session.nodes.get(byName(name).id);
  const source = /*CONTROL_SOURCE*/;
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    if (designer) {
      projectRoot.event_code.native_control = source;
      byName('Launch').event_handlers.click = 'native_control';
      await sync(); if (!preview) togglePreview(); await queue;
    }
    session = designer ? previewSession : controlSession;
    const model = JSON.stringify(project), button = node('Launch'), input = node('NameInput'), label = node('StatusLabel');
    const errors = []; originalError = session.onError;
    session.onError = error => { errors.push(error.message); if (designer) originalError(error); };
    button.value = ''; button.click(); await session.pending;
    assert(input.value === 'Hello World', 'The screenshot NameInput.Text assignment updates the actual input');
    assert(node('NameInput') === input && node('Launch') === button, 'Property writes retain actual control nodes and event listeners');
    input.value = 'Current user input'; input.dispatchEvent(new Event('input', {bubbles: true}));
    input.focus(); input.setSelectionRange(2, 6);
    button.value = 'read'; button.click(); await session.pending;
    assert(label.textContent === 'Current user input', 'Handlers read current typed values from other controls');
    assert(document.activeElement === input && input.selectionStart === 2 && input.selectionEnd === 6 && input.value === 'Current user input',
      'Updating another control preserves input focus, caret and text');
    input.value = '0'; input.dispatchEvent(new Event('input', {bubbles: true}));
    button.value = 'count'; button.click(); button.click(); await session.pending;
    assert(input.value === '2', 'Rapid events execute sequentially and see earlier writes');
    button.value = 'disable'; button.click(); await session.pending;
    assert(input.disabled && label.hidden && button.textContent === 'Changed label', 'Enabled, Visible and button Text updates reach native-rendered controls');
    button.value = 'enable'; button.click(); await session.pending;
    assert(!input.disabled && !label.hidden && button.textContent === 'Launch', 'Existing control listeners survive property changes');
    button.value = 'bad'; button.click(); await session.pending;
    assert(errors.length === 1 && errors[0].includes('MissingProperty') && input.value === '2', 'Handler errors report the bad property without partial UI writes');
    if (designer) assert(status.textContent.includes('MissingProperty'), 'Preview surfaces Python errors in the status area');
    button.value = ''; button.click(); await session.pending;
    assert(input.value === 'Hello World', 'The event queue remains usable after a Python error');
    assert(JSON.stringify(project) === model, 'Runtime property changes do not rewrite design definitions');

    fixture = document.createElement('div'); fixture.style.cssText = 'position:fixed;left:10px;top:100px;width:260px;height:100px;z-index:10'; document.body.appendChild(fixture);
    const definition = clone(byName('NameInput')); definition.id = 'async-input';
    const asyncInput = viperComponents.make(definition, true, () => {}); fixture.appendChild(asyncInput);
    const fakeForm = {form_id: 'async-form', components: [definition]}, nodes = new Map([[definition.id, asyncInput]]);
    let resolveRequest;
    const deferred = new ViperControlSession(fakeForm, nodes, () => new Promise(resolve => { resolveRequest = resolve; }), error => { throw error; });
    try {
      asyncInput.value = 'Before request';
      const pending = deferred.dispatch({component_id: definition.id, event: 'click'}); await tick();
      asyncInput.value = 'New typing'; asyncInput.dispatchEvent(new Event('input', {bubbles: true}));
      resolveRequest({updates: [{window_id: 'async-form', component_id: definition.id, properties: {text: 'Late server reply'}}]}); await pending;
      assert(asyncInput.value === 'New typing', 'A delayed reply does not overwrite newer typing');
      const pendingDispose = deferred.dispatch({component_id: definition.id, event: 'click'}); await tick();
      deferred.dispose();
      resolveRequest({updates: [{window_id: 'async-form', component_id: definition.id, properties: {text: 'Closed session reply'}}]}); await pendingDispose;
      assert(asyncInput.value === 'New typing', 'Stopped sessions ignore in-flight replies');
    } finally { deferred.dispose(); }
    const scoped = new ViperControlSession(fakeForm, nodes, async () => ({updates: [{window_id: 'other-form', component_id: definition.id, properties: {text: 'Wrong window'}}]}));
    try { await scoped.dispatch({component_id: definition.id, event: 'click'}); assert(asyncInput.value === 'New typing', 'Property patches are scoped to their window'); }
    finally { scoped.dispose(); }
    const disabledDefinition = {...clone(byName('Launch')), id: 'disabled-button', enabled: false}; let clicks = 0;
    const disabledButton = viperComponents.make(disabledDefinition, true, () => clicks++); fixture.appendChild(disabledButton);
    disabledButton.click(); assert(clicks === 0, 'Initially disabled controls suppress events');
    viperComponents.apply(disabledButton, disabledDefinition, {enabled: true}); disabledButton.click();
    assert(clicks === 1, 'Enabling an initially disabled control makes its event handler usable');
    const checkDefinition = {...clone(disabledDefinition), id: 'check', name: 'Check', type: 'checkbox', text: 'Before'};
    const checkbox = viperComponents.make(checkDefinition, true, () => clicks++); fixture.appendChild(checkbox);
    const checkInput = checkbox.querySelector('input'), beforeClicks = clicks;
    viperComponents.apply(checkbox, checkDefinition, {enabled: true, checked: true, text: 'After'});
    assert(checkbox.querySelector('input') === checkInput && checkInput.checked && checkbox.textContent === 'After' && clicks === beforeClicks,
      'Checkbox properties preserve the input and do not emit synthetic events');
    checkInput.click(); assert(clicks === beforeClicks + 2, 'Re-enabled checkbox dispatches one click and one change');
    fixture.remove(); fixture = null;
    if (designer) {
      const beforeSave = input.value;
      await sync(); button.value = 'read'; button.click(); await session.pending;
      assert(label.textContent === beforeSave, 'Saving the unchanged design does not discard Preview control state');
      togglePreview(); await queue;
      assert(project.components.find(component => component.name === 'NameInput').text === 'Alice' && canvas.querySelector('input.component').value === 'Alice',
        'Stopping Preview restores authored text');
      togglePreview(); await queue;
      session = previewSession; const freshInput = node('NameInput');
      assert(freshInput.value === 'Alice', 'A new Preview starts with a fresh runtime state');
    }
    return {passed: checks};
  } catch (error) { return {passed: checks, error: error.message, stack: error.stack}; }
  finally {
    fixture?.remove();
    if (session && originalError) session.onError = originalError;
    if (designer) { replaceProject(original); await sync(); }
  }
})()
