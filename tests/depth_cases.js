/* Real hit testing of overlapping controls in Designer, Preview and Run. */
(async () => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const designer = typeof previewSession !== 'undefined';
  const original = copy(designer ? projectRoot : project);
  let passed = 0;
  const assert = (condition, message) => { if (!condition) throw new Error(message); passed++; };
  const hit = () => {
    const node = canvas.querySelector('[data-id="depth-button"]');
    const bounds = node.getBoundingClientRect();
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      ?.closest('[data-id]')?.dataset.id;
  };
  try {
    const form = copy(project);
    const button = copy(form.components.find(c => c.type === 'button'));
    const panel = copy(form.components.find(c => c.type === 'panel'));
    button.id = 'depth-button'; panel.id = 'depth-panel';
    button.depth = 4; panel.depth = 0;
    for (const c of [button, panel]) {
      c.visible = true; c.event_handlers = {};
      c.box = {x: 80, y: 80, width: 240, height: 180,
        reference_width: form.canvas_width, reference_height: form.canvas_height};
    }
    form.components = [button, panel]; form.links = [];
    if (designer) {
      const root = copy(original);
      root.windows = [form]; root.startup_window_id = form.form_id;
      replaceProject(root);
    } else { project = form; render(); }
    assert(hit() === button.id, 'A later-added background panel stays behind the front button');
    if (designer) {
      selectComponent(panel.id);
      assert(hit() === button.id, 'Selecting a covered panel does not raise it');
      const input = document.getElementById('component-depth');
      assert(input.value === '0' && input.options.length === 5, 'Inspector offers five depth levels and shows selected depth');
      input.value = '4'; input.dispatchEvent(new Event('change'));
      assert(selected().depth === 4 && hit() === panel.id, 'Inspector edits depth; later element wins a tie');
      await queue;
      const saved = await viperHost.request('bootstrap');
      assert(saved.project.windows[0].components[1].depth === 4, 'Depth edits reach the saved Python project');
      input.value = '0'; input.dispatchEvent(new Event('change'));
      const bounds = copy(relativeLayout.rectangles.get(button.id));
      assert(hit() === button.id, 'Lowering depth immediately reveals the button');
      assert(JSON.stringify(bounds) === JSON.stringify(relativeLayout.rectangles.get(panel.id)), 'Depth changes preserve rectangle geometry');
      duplicate();
      assert(selected().depth === 0, 'Duplication retains depth');
      remove();
      togglePreview(); await queue;
      assert(document.getElementById('component-depth').disabled, 'Depth is disabled in Preview');
      assert(hit() === button.id, 'Preview matches Designer overlap order');
      togglePreview(); await queue;
    }
    for (let depth = 0; depth <= 4; depth++) {
      project.components[0].depth = depth;
      project.components[1].depth = depth;
      render();
      assert(hit() === panel.id, `Stable later-element tie order at depth ${depth}`);
      project.components[1].depth = depth === 4 ? 0 : depth + 1;
      render();
      assert(hit() === (depth === 4 ? button.id : panel.id), `Hit testing respects depth ${depth}`);
    }
    delete project.components[0].depth; delete project.components[1].depth; render();
    assert(hit() === panel.id, 'Legacy depth fallback preserves original order');
    return {passed};
  } catch (error) { return {passed, error: error.stack || error.message}; }
  finally {
    if (designer) { replaceProject(original); await sync(); }
    else { project = original; render(); }
  }
})()
