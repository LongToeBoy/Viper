/* One renderer for design, preview, and standalone applications. */
window.viperComponents = {
  bounds(layout, width, height) {
    const w = Math.min(width, Math.max(layout.min_width, layout.width * width / 100));
    const h = Math.min(height, Math.max(layout.min_height, layout.height * height / 100));
    return {x: Math.min(Math.max(0, layout.x * width / 100), width - w),
      y: Math.min(Math.max(0, layout.y * height / 100), height - h), width: w, height: h};
  },
  make(component, interactive, onEvent) {
    const tags = {button: 'button', label: 'span', text_input: 'input', checkbox: 'label', panel: 'section'};
    if (!tags[component.type]) throw new Error(`Unsupported component: ${component.type}`);
    const el = document.createElement(tags[component.type]);
    el.className = 'component';
    el.dataset.id = component.id;
    if (component.type === 'text_input') {
      el.type = 'text'; el.value = component.text;
    } else if (component.type === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox'; input.disabled = !interactive || !component.enabled;
      const caption = document.createElement('span'); caption.className = 'component-caption'; caption.textContent = component.text;
      el.append(input, caption);
    } else el.textContent = component.text;
    el.hidden = !component.visible;
    if ('disabled' in el) el.disabled = interactive && !component.enabled;
    el.dataset.enabled = String(component.enabled);
    if (interactive) el.setAttribute('aria-disabled', String(!component.enabled));
    const s = component.style;
    Object.assign(el.style, {fontSize: `${s.font_size}px`, fontWeight: s.font_weight,
      color: s.text_color, backgroundColor: s.background_color, borderRadius: `${s.border_radius}px`,
      borderWidth: `${s.border_width}px`, borderColor: s.border_color, padding: `${s.padding}px`});
    if (interactive) {
      for (const event of ['click', 'change']) el.addEventListener(event, e => {
        if (el.dataset.enabled === 'false' || (component.type === 'checkbox' && e.target !== el.querySelector('input'))) return;
        onEvent({component_id: component.id, event, value: component.type === 'checkbox' ? el.querySelector('input').checked : el.value});
      });
    }
    return el;
  },
  apply(el, component, properties) {
    if (Object.hasOwn(properties, 'text')) {
      if (component.type === 'text_input') { if (el.value !== properties.text) el.value = properties.text; }
      else if (component.type === 'checkbox') el.querySelector('.component-caption').textContent = properties.text;
      else el.textContent = properties.text;
    }
    if (Object.hasOwn(properties, 'checked') && component.type === 'checkbox') el.querySelector('input').checked = properties.checked;
    if (Object.hasOwn(properties, 'visible')) el.hidden = !properties.visible;
    if (Object.hasOwn(properties, 'enabled')) {
      el.dataset.enabled = String(properties.enabled); el.setAttribute('aria-disabled', String(!properties.enabled));
      if ('disabled' in el) el.disabled = !properties.enabled;
      if (component.type === 'checkbox') el.querySelector('input').disabled = !properties.enabled;
    }
  },
  position(el, component, parent) {
    const b = this.bounds(component.layout, parent.clientWidth, parent.clientHeight);
    Object.assign(el.style, {left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px`});
  }
};
