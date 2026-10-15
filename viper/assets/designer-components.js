/* Designer-only wrappers and gestures; runtime controls stay in components.js. */
window.viperDesignerComponents = {
  resize(bounds, edge, dx, dy, width, height, minWidth, minHeight) {
    let left = bounds.x, top = bounds.y;
    let right = left + bounds.width, bottom = top + bounds.height;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    if (edge === 'left') left = clamp(left + dx, 0, right - Math.min(minWidth, right));
    if (edge === 'right' || edge === 'corner') right = clamp(right + dx, left + Math.min(minWidth, width - left), width);
    if (edge === 'top') top = clamp(top + dy, 0, bottom - Math.min(minHeight, bottom));
    if (edge === 'bottom' || edge === 'corner') bottom = clamp(bottom + dy, top + Math.min(minHeight, height - top), height);
    return {x: left, y: top, width: right - left, height: bottom - top};
  },
  wrap(control, component, canvas, callbacks) {
    const wrapper = document.createElement('div');
    wrapper.className = 'component-wrapper';
    wrapper.dataset.id = component.id;
    wrapper.style.zIndex = viperComponents.depth(component);
    // The wrapper owns depth; keep its editing handles above the inner control.
    control.style.zIndex = 'auto';
    wrapper.hidden = !component.visible;
    wrapper.appendChild(control);
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      const handle = document.createElement('span');
      handle.className = `position-anchor anchor-${edge}`;
      handle.dataset.anchor = edge;
      handle.title = `${edge} layout anchor`;
      handle.setAttribute('aria-label', `${edge} layout anchor`);
      wrapper.appendChild(handle);
    }
    const resizeHandle = document.createElement('span');
    resizeHandle.className = 'resize-handle';
    resizeHandle.dataset.edge = 'corner';
    resizeHandle.setAttribute('aria-label', 'Resize component');
    wrapper.appendChild(resizeHandle);
    const menu = document.createElement('select'); menu.className = 'component-size-menu';
    menu.setAttribute('aria-label', `${component.name} size behavior`);
    menu.append(new Option('Fixed', 'fixed'), new Option('Stretch', 'stretch'));
    menu.value = component.size_mode || 'fixed';
    menu.addEventListener('pointerdown', event => event.stopPropagation());
    menu.addEventListener('click', event => event.stopPropagation());
    menu.onchange = event => { event.stopPropagation(); callbacks.sizeMode(component.id, menu.value); menu.value = component.size_mode; };
    wrapper.appendChild(menu);
    wrapper.addEventListener('dblclick', event => {
      if (event.target.closest('.position-anchor, .resize-handle, .component-size-menu')) return;
      event.preventDefault(); event.stopPropagation(); callbacks.events(component.id);
    });
    wrapper.addEventListener('click', event => {
      event.stopPropagation();
      const anchor = event.target.closest('.position-anchor');
      if (anchor) callbacks.anchor(component.id, anchor.dataset.anchor);
      else callbacks.select(component.id);
    });
    wrapper.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      if (event.target.closest('.position-anchor')) return;
      callbacks.select(component.id);
      const edge = event.target.dataset.edge;
      const width = canvas.clientWidth, height = canvas.clientHeight, scale = callbacks.scale();
      const origin = {...callbacks.rectangle(component.id)};
      const x = event.clientX, y = event.clientY;
      wrapper.setPointerCapture(event.pointerId);
      function move(e) {
        if (e.pointerId !== event.pointerId) return;
        const dx = (e.clientX - x) / scale, dy = (e.clientY - y) / scale;
        const bounds = edge ? viperDesignerComponents.resize(origin, edge, dx, dy, width, height,
          component.layout.min_width, component.layout.min_height) : {
          ...origin, x: Math.max(0, Math.min(width - origin.width, origin.x + dx)),
          y: Math.max(0, Math.min(height - origin.height, origin.y + dy))};
        callbacks.move(component.id, bounds, edge);
        callbacks.inspect();
      }
      function end(e) {
        if (e.pointerId !== event.pointerId) return;
        wrapper.removeEventListener('pointermove', move);
        wrapper.removeEventListener('pointerup', end);
        wrapper.removeEventListener('pointercancel', end);
        wrapper.removeEventListener('lostpointercapture', end);
        if (wrapper.hasPointerCapture(event.pointerId)) wrapper.releasePointerCapture(event.pointerId);
        // Keep the same node on a plain click so the browser can recognize a double-click.
        if (callbacks.rectangle(component.id) &&
            Object.keys(origin).some(key => callbacks.rectangle(component.id)[key] !== origin[key])) callbacks.changed();
      }
      wrapper.addEventListener('pointermove', move);
      wrapper.addEventListener('pointerup', end);
      wrapper.addEventListener('pointercancel', end);
      wrapper.addEventListener('lostpointercapture', end);
    });
    return wrapper;
  }
};
