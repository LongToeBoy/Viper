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
      el.append(input, document.createTextNode(component.text));
    } else el.textContent = component.text;
    el.hidden = !component.visible;
    if ('disabled' in el) el.disabled = interactive && !component.enabled;
    const s = component.style;
    Object.assign(el.style, {fontSize: `${s.font_size}px`, fontWeight: s.font_weight,
      color: s.text_color, backgroundColor: s.background_color, borderRadius: `${s.border_radius}px`,
      borderWidth: `${s.border_width}px`, borderColor: s.border_color, padding: `${s.padding}px`});
    if (interactive && component.enabled) {
      for (const event of ['click', 'change']) el.addEventListener(event, e => onEvent({
        component_id: component.id, event, value: e.target.type === 'checkbox' ? e.target.checked : e.target.value
      }));
    }
    return el;
  },
  position(el, component, parent) {
    const b = this.bounds(component.layout, parent.clientWidth, parent.clientHeight);
    Object.assign(el.style, {left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px`});
  }
};
