/* Shared theme palettes. References keep a color's role when switching themes. */
window.ViperThemeColors = {
  defaults: {primary:'#2563eb', secondary:'#475569', success:'#16a34a', danger:'#dc2626',
    warning:'#f59e0b', info:'#0ea5e9', background:'#0f1b2f', surface:'#1f2937',
    text:'#f4f6fb', muted:'#94a3b8', border:'#475569'},
  label(key) { return key.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); },
  reference(key, fallback) { return `var(--viper-color-${key}, ${fallback})`; },
  key(value) { return /^var\(--viper-color-([a-z0-9-]+),\s*#[\da-f]{6}(?:[\da-f]{2})?\)$/i.exec(value || '')?.[1]; },
  hex(value, doc = document) {
    if (!value || !CSS.supports('color', value) || /\b(var|currentcolor|inherit|initial|unset|revert)\b/i.test(value)) return null;
    const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d'); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
    const rgba = [...context.getImageData(0, 0, 1, 1).data];
    return '#' + rgba.slice(0, rgba[3] === 255 ? 3 : 4).map(part => part.toString(16).padStart(2, '0')).join('');
  },
  build(root, sheet) {
    const doc = root.ownerDocument, palette = new Map();
    const cache = new Map();
    const hex = value => {
      if (!cache.has(value)) cache.set(value, this.hex(value, doc));
      return cache.get(value);
    };
    const add = (key, color, label = this.label(key)) => {
      if (!/^[a-z][a-z0-9-]{0,90}$/.test(key)) return;
      color = hex(color);
      if (color && color !== '#00000000') palette.set(key, {key, label, color, value:this.reference(key, color)});
    };
    if (!sheet) for (const [key, color] of Object.entries(this.defaults)) add(key, color);
    else {
      const names = new Set(), literals = new Set();
      const walk = rules => {
        for (const rule of rules) {
          if (rule.style) for (const property of rule.style) {
            const value = rule.style.getPropertyValue(property);
            if (property.startsWith('--')) names.add(property);
            else if (property.includes('color')) {
              const color = hex(value); if (color && color !== '#00000000') literals.add(color);
            }
          }
          if (rule.cssRules) walk(rule.cssRules);
        }
      };
      walk(sheet.cssRules);
      const container = doc.createElement('div');
      container.style.cssText = 'position:fixed!important;left:-10000px!important;visibility:hidden!important;pointer-events:none!important';
      root.append(container);
      const probe = (tag, classes) => {
        const node = doc.createElement(tag); node.className = classes; container.append(node); return node;
      };
      const sample = probe('span', '');
      const variables = new Map();
      const rootStyle = getComputedStyle(doc.documentElement), bodyStyle = getComputedStyle(doc.body);
      for (const name of names) {
        const value = bodyStyle.getPropertyValue(name).trim() || rootStyle.getPropertyValue(name).trim();
        if (!value || !CSS.supports('color', value)) continue;
        sample.style.setProperty('color', `var(${name})`, 'important');
        const color = hex(getComputedStyle(sample).color);
        const key = name.slice(2).replace(/^(bs|bulma|pico|theme|color)-/, '');
        if (color) variables.set(key, color);
      }
      const find = (...keys) => {
        for (const key of keys) {
          if (variables.has(key)) return variables.get(key);
          const entry = [...variables].find(([name]) => name.endsWith(`-${key}`));
          if (entry) return entry[1];
        }
      };
      const button = getComputedStyle(probe('button', 'component btn btn-primary button is-primary'));
      const panel = getComputedStyle(probe('section', 'component card card-body'));
      const input = getComputedStyle(probe('input', 'component form-control input'));
      const opaque = value => { const color = hex(value); return color?.length === 7 ? color : null; };
      add('primary', find('primary', 'primary-color', 'accent', 'accent-color') || opaque(button.backgroundColor) || this.defaults.primary);
      add('secondary', find('secondary', 'secondary-color') || bodyStyle.color);
      for (const key of ['success', 'danger', 'warning', 'info']) {
        const color = find(key, `${key}-color`); if (color) add(key, color);
      }
      add('background', find('body-bg', 'background', 'background-color') || bodyStyle.backgroundColor);
      add('surface', find('surface', 'surface-color', 'secondary-bg') || opaque(panel.backgroundColor) || bodyStyle.backgroundColor);
      add('text', find('body-color', 'text', 'text-color') || bodyStyle.color);
      add('muted', find('muted', 'muted-color', 'secondary-color') || bodyStyle.color);
      add('border', find('border-color', 'border') || opaque(input.borderTopColor) || bodyStyle.color);
      for (const [key, color] of variables) {
        if (palette.size >= 128) break;
        if (!palette.has(key)) add(key, color);
      }
      for (const color of literals) {
        if (palette.size >= 128) break;
        if (![...palette.values()].some(entry => entry.color === color)) add(`swatch-${color.slice(1)}`, color, `Theme color ${color.toUpperCase()}`);
      }
      container.remove();
    }
    // Variables belong only to the app surface, including the unthemed canvas.
    const scope = sheet ? doc.documentElement : root;
    for (const property of [...scope.style]) if (property.startsWith('--viper-color-')) scope.style.removeProperty(property);
    for (const entry of palette.values()) scope.style.setProperty(`--viper-color-${entry.key}`, entry.color);
    return [...palette.values()];
  }
};
