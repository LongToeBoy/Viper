/* Button -> label.Text -> label change -> another displayed control. */
(async () => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const designer = typeof previewSession !== 'undefined';
  const original = designer ? clone(projectRoot) : null;
  const byName = name => project.components.find(component => component.name === name);
  let passed = 0, session, originalRequest;
  const assert = (condition, message) => { if (!condition) throw new Error(message); passed++; };
  try {
    if (designer) {
      byName('Launch').event_handlers.click = 'native_control';
      byName('StatusLabel').event_handlers.change = 'native_label_changed';
      projectRoot.event_code.native_control = /*CONTROL_SOURCE*/;
      projectRoot.event_code.native_label_changed = /*LABEL_SOURCE*/;
      await sync(); if (!preview) togglePreview(); await queue;
    }
    session = designer ? previewSession : controlSession;
    const node = name => session.nodes.get(byName(name).id);
    const button = node('Launch'), input = node('NameInput'), label = node('StatusLabel'), panel = node('MainPanel');
    const model = JSON.stringify(project);
    const sent = []; originalRequest = session.request;
    session.request = payload => { sent.push(payload); return originalRequest(payload); };
    button.value = 'change-test'; button.click(); await session.pending;
    assert(label.textContent === 'Change test: updated by button', 'Button updates StatusLabel.Text');
    assert(input.value === 'Label change #1: Change test: updated by button', 'The label change handler runs and updates another actual control');
    assert(panel.textContent === `change:Text:${project.form_id}`, 'Property changes deliver event kind, property and owning window');
    assert(sent.length === 1 && sent[0].event === 'click', 'Python runs the change cascade without a second frontend event');
    input.value = 'No repeat'; input.dispatchEvent(new Event('input', {bubbles: true}));
    button.click(); await session.pending;
    assert(input.value === 'No repeat', 'Assigning unchanged label text does not trigger its handler again');
    assert(sent.length === 2, 'One transport request per user click');
    assert(JSON.stringify(project) === model, 'The change cascade preserves authored component definitions');
    return {passed};
  } catch (error) { return {passed, error: error.stack || error.message}; }
  finally {
    if (originalRequest) session.request = originalRequest;
    if (designer) { replaceProject(original); await sync(); }
  }
})()
