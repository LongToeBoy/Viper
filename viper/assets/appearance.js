/* Application CSS lives in its own document; editor chrome never receives it. */
window.ViperAppearance = {
  keyboardFocusSelector(selector) {
    let result = '', quote = '', brackets = 0;
    for (let i = 0; i < selector.length; i++) {
      const char = selector[i];
      if (char === '\\') { result += char + (selector[++i] || ''); continue; }
      if (quote) { result += char; if (char === quote) quote = ''; continue; }
      if (char === '"' || char === "'") { quote = char; result += char; continue; }
      if (char === '/' && selector[i + 1] === '*') {
        const end = selector.indexOf('*/', i + 2);
        if (end < 0) return result + selector.slice(i);
        result += selector.slice(i, end + 2); i = end + 1; continue;
      }
      if (char === '[') brackets++;
      if (char === ']') brackets--;
      if (!brackets && selector.slice(i, i + 6).toLowerCase() === ':focus' && !/[-\w\\]/.test(selector[i + 6] || '')) {
        // :where adds no specificity. Inputs keep normal mouse focus styling.
        result += ':focus:where(:focus-visible, :not(button.component))'; i += 5;
      } else result += char;
    }
    return result;
  },
  adaptButtonFocus(rules) {
    for (const rule of rules) {
      if (rule.selectorText?.toLowerCase().includes(':focus')) {
        const selector = this.keyboardFocusSelector(rule.selectorText);
        if (selector !== rule.selectorText) rule.selectorText = selector;
      }
      if (rule.cssRules) this.adaptButtonFocus(rule.cssRules);
    }
  },
  properties: {
    font_family: ['font-family', false], font_size: ['font-size', true], font_weight: ['font-weight', false],
    text_color: ['color', false], background_color: ['background-color', false], border_color: ['border-color', false],
    border_width: ['border-width', true], border_radius: ['border-radius', true], padding: ['padding', true],
    text_align: ['text-align', false], white_space: ['white-space', false],
    overflow_wrap: ['overflow-wrap', false], overflow: ['overflow', false]
  },
  applyStyle(node, component, themed) {
    if (!themed) for (const [key, [property, pixels]] of Object.entries(this.properties)) {
      const value = component.style?.[key];
      if (value !== undefined) node.style.setProperty(property, pixels ? `${value}px` : String(value));
    }
    for (const [key, value] of Object.entries(component.style_overrides || {})) {
      const [property, pixels] = this.properties[key] || [];
      if (property) node.style.setProperty(property, pixels ? `${value}px` : String(value), 'important');
    }
    if (Object.hasOwn(component.style_overrides || {}, 'border_width')) node.style.setProperty('border-style', 'solid', 'important');
    if (component.style_overrides?.text_align) node.style.setProperty('justify-content',
      {left:'flex-start', right:'flex-end'}[component.style_overrides.text_align] || 'center', 'important');
  },
  classes: {button: ['btn', 'btn-primary', 'button', 'is-primary'], text_input: ['form-control', 'input'],
    label: ['form-label'], panel: ['card', 'card-body'], checkbox: ['form-check']},
  base: `@layer viper-base {
    * { box-sizing:border-box; }
    html,body { width:100%;height:100%;margin:0;padding:0; }
    body { font:16px/1.5 system-ui,sans-serif;color:#222;background:#fff; }
    .component { position:absolute;display:flex;align-items:center;justify-content:center;
      font:inherit;color:inherit;background:transparent;border:0;padding:0; }
  }`,
  editing: `
    html,body { margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important; }
    #application-root { position:relative!important;width:100%!important;height:100%!important; }
    .component { position:absolute!important;box-sizing:border-box!important;margin:0!important;
      min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important; }
    .component[hidden],.component-wrapper[hidden] { display:none!important; }
    .component-wrapper { position:absolute;cursor:move;touch-action:none; }
    .component-wrapper > .component { left:0!important;top:0!important;width:100%!important;height:100%!important;transform:none!important;pointer-events:none; }
    .component-wrapper.selected { outline:2px solid #5ba0ff;outline-offset:1px; }
    .position-anchor { display:none;position:absolute;width:12px;height:12px;border:2px solid #fff;
      border-radius:50%;background:#5ba0ff;touch-action:none;box-sizing:border-box; }
    .component-wrapper.selected > .position-anchor,.component-wrapper.selected > .resize-handle,
      .connecting-links .position-anchor { display:block; }
    .anchor-top { top:-6px;left:calc(50% - 6px); }.anchor-bottom { bottom:-6px;left:calc(50% - 6px); }
    .anchor-left { left:-6px;top:calc(50% - 6px); }.anchor-right { right:-6px;top:calc(50% - 6px); }
    .resize-handle { display:none;position:absolute;right:0;bottom:0;width:12px;height:12px;
      background:#5ba0ff;border:1px solid #fff;cursor:se-resize; }
    .component-size-menu { position:absolute!important;right:4px!important;top:3px!important;z-index:4;
      width:65px!important;height:20px!important;min-height:0!important;margin:0!important;padding:1px 2px!important;
      font:10px system-ui!important;color:#e5ecff!important;background:#1d2a42!important;border:1px solid #2c3c58!important;
      border-radius:4px!important;box-shadow:none!important;cursor:pointer; }
    .anchor-pending { background:#ffca73;outline:2px solid #ffca73; }
    .anchors-hidden .position-anchor { display:none!important; }
  `
};

class ViperApplicationSurface {
  constructor(canvas) { this.canvas = canvas; this.root = canvas; this.themed = false; this.palette = []; }
  prepare(theme) {
    this.canvas.replaceChildren(); this.themed = !!theme; this.frame = null;
    if (!theme) { this.root = this.canvas; this.palette = ViperThemeColors.build(this.root); return this.root; }
    const frame = document.createElement('iframe');
    frame.title = 'Application visual surface'; frame.setAttribute('sandbox', 'allow-same-origin');
    Object.assign(frame.style, {position:'absolute', inset:'0', width:'100%', height:'100%', border:'0', display:'block'});
    this.canvas.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open(); doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="application-root"></main></body></html>'); doc.close();
    const policy = doc.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";
    doc.head.prepend(policy);
    let themeSheet;
    for (const [index, css] of [ViperAppearance.base, theme.css, ViperAppearance.editing].entries()) {
      const style = doc.createElement('style'); style.textContent = css; doc.head.appendChild(style);
      if (index === 1) themeSheet = style.sheet;
    }
    this.frame = frame; this.root = doc.getElementById('application-root');
    ViperAppearance.adaptButtonFocus(themeSheet.cssRules);
    this.palette = ViperThemeColors.build(this.root, themeSheet);
    return this.root;
  }
  syncPreferences(values) {
    this.root.classList.toggle('anchors-hidden', values.showAnchors === false);
  }
  background(settings) {
    const target = this.themed ? this.root.ownerDocument.body : this.canvas;
    const color = settings.background_theme_color ? ViperThemeColors.reference(settings.background_theme_color, settings.background_color) : settings.background_color;
    target.style.setProperty('background-color', this.themed && settings.use_theme_background !== false ? '' : color, 'important');
    if (this.themed) target.style.setProperty('background-image', settings.use_theme_background !== false ? '' : 'none', 'important');
  }
  parentPoint(event, scale) {
    if (!this.frame || event.target?.ownerDocument !== this.root.ownerDocument) return {x:event.clientX,y:event.clientY};
    const box = this.frame.getBoundingClientRect();
    return {x:box.left + event.clientX * scale, y:box.top + event.clientY * scale};
  }
}
globalThis.ViperApplicationSurface = ViperApplicationSurface;
