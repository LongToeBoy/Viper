/* One renderer for design, preview, and standalone applications. */
window.viperComponents = {
  depth(component) {
    return Number.isInteger(component.depth) && component.depth >= 0 && component.depth <= 4 ? component.depth : 2;
  },
  bounds(layout, width, height) {
    const w = Math.min(width, Math.max(layout.min_width, layout.width * width / 100));
    const h = Math.min(height, Math.max(layout.min_height, layout.height * height / 100));
    return {x: Math.min(Math.max(0, layout.x * width / 100), width - w),
      y: Math.min(Math.max(0, layout.y * height / 100), height - h), width: w, height: h};
  },
  make(component, interactive, onEvent, themed = false) {
    const tags = {button: 'button', label: 'span', text_input: 'input', checkbox: 'label', panel: 'section'};
    if (!tags[component.type]) throw new Error(`Unsupported component: ${component.type}`);
    const el = document.createElement(tags[component.type]);
    el.className = 'component';
    if (themed) el.classList.add(...(ViperAppearance.classes[component.type] || []));
    el.dataset.id = component.id;
    el.style.setProperty('z-index', this.depth(component), 'important');
    if (component.type === 'text_input') {
      el.type = 'text'; el.value = component.text;
    } else if (component.type === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox'; input.disabled = !interactive || !component.enabled;
      if (themed) input.className = 'form-check-input';
      const caption = document.createElement('span'); caption.className = 'component-caption'; caption.textContent = component.text;
      if (themed) caption.classList.add('form-check-label');
      el.append(input, caption);
    } else el.textContent = component.text;
    el.hidden = !component.visible;
    if (!component.visible) el.style.setProperty('display', 'none', 'important');
    if ('disabled' in el) el.disabled = interactive && !component.enabled;
    el.dataset.enabled = String(component.enabled);
    if (interactive) el.setAttribute('aria-disabled', String(!component.enabled));
    ViperAppearance.applyStyle(el, component, themed);
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
    if (Object.hasOwn(properties, 'visible')) {
      el.hidden = !properties.visible;
      if (properties.visible) el.style.removeProperty('display');
      else el.style.setProperty('display', 'none', 'important');
    }
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
