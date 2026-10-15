/* Project appearance tools; CSS never enters the designer's document. */
class ViperAppearanceInspector {
  constructor(callbacks) {
    this.callbacks = callbacks; this.library = []; this.colorPicker = new ViperColorPicker();
    this.themeSelect = document.getElementById('project-theme');
    this.inputs = new Map(); this.pickers = new Map();
    const fields = {
      font_family: ['Font family'], font_size: ['Font size (px)', 'number'],
      font_weight: ['Font weight', ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']],
      text_color: ['Text color'], background_color: ['Background color'], border_color: ['Border color'],
      border_width: ['Border width (px)', 'number'], border_radius: ['Corner radius (px)', 'number'],
      padding: ['Padding (px)', 'number'], text_align: ['Text alignment', ['left', 'center', 'right', 'justify']],
      white_space: ['Text wrapping', ['normal', 'nowrap', 'pre-wrap', 'pre-line']],
      overflow_wrap: ['Long words', ['normal', 'break-word', 'anywhere']],
      overflow: ['Overflow', ['visible', 'hidden', 'auto']]
    };
    const container = document.getElementById('style-fields');
    for (const [key, [name, kind]] of Object.entries(fields)) {
      const label = document.createElement('label'); label.append(name);
      const input = document.createElement(Array.isArray(kind) ? 'select' : 'input');
      input.id = `style-${key}`;
      if (Array.isArray(kind)) input.append(new Option('Theme / default', ''), ...kind.map(value => new Option(value, value)));
      else {
        input.type = kind || 'text'; input.placeholder = 'Theme / default';
        if (kind === 'number') { input.min = key === 'font_size' ? 1 : 0; input.max = 500; input.step = 'any'; }
      }
      if (key.endsWith('_color')) {
        const row = document.createElement('div'); row.className = 'appearance-color';
        const picker = document.createElement('button'); picker.type = 'button'; picker.className = 'color-button';
        picker.setAttribute('aria-label', `Choose ${name.toLowerCase()}`);
        picker.onchange = () => { input.value = picker.value; input.dispatchEvent(new Event('change')); };
        picker.onclick = () => this.componentColor(key, name);
        row.append(input, picker); label.append(row); this.pickers.set(key, picker);
      } else label.append(input);
      container.append(label); this.inputs.set(key, input);
      input.onchange = () => {
        const component = callbacks.selected();
        if (!component || !callbacks.editable()) return;
        const value = input.value.trim(), [property, pixels] = ViperAppearance.properties[key];
        if (value && (!input.reportValidity() || !CSS.supports(property, pixels ? `${value}px` : value))) {
          callbacks.status(`Invalid ${name.toLowerCase()}`); this.refresh(); return;
        }
        component.style_overrides ||= {};
        if (value) component.style_overrides[key] = pixels ? Number(value) : value;
        else delete component.style_overrides[key];
        callbacks.changed();
      };
    }
    for (const property of ['visible', 'enabled']) document.getElementById(`component-${property}`).onchange = event => {
      const component = callbacks.selected();
      if (!component || !callbacks.editable()) return;
      component[property] = event.target.checked; callbacks.changed();
    };
    document.getElementById('reset-component-style').onclick = () => {
      const component = callbacks.selected();
      if (!component || !callbacks.editable()) return;
      component.style_overrides = {}; callbacks.changed();
    };
    this.themeSelect.onchange = () => this.choose(this.themeSelect.value);
    document.getElementById('import-theme').onclick = () => this.load('theme-import');
    document.getElementById('refresh-themes').onclick = () => this.refreshLibrary();
    const background = document.getElementById('window-background');
    background.onclick = () => this.windowColor();
    background.onchange = () => {
      const form = callbacks.form(); if (!form || !callbacks.editable()) return;
      if (!/^#[\da-f]{6}$/i.test(background.value)) return;
      Object.assign(form.window, {background_color:background.value, background_theme_color:'', use_theme_background:false});
      callbacks.changed();
    };
  }
  paintColor(button, color, value, defaultLabel) {
    const key = ViperThemeColors.key(value);
    const entry = this.callbacks.surface().palette.find(entry => entry.key === key);
    const label = key ? entry?.label || `${ViperThemeColors.label(key)} (saved color)` : value ? color.toUpperCase() : defaultLabel;
    ViperColorPicker.paint(button, color, label);
  }
  componentColor(key, name) {
    const component = this.callbacks.selected(), root = this.callbacks.root(), form = this.callbacks.form();
    if (!component || !this.callbacks.editable()) return;
    const node = this.callbacks.control(), property = ViperAppearance.properties[key][0], surface = this.callbacks.surface();
    const clone = node.cloneNode(true); clone.style.removeProperty(property);
    if (!surface.themed && component.style?.[key]) clone.style.setProperty(property, component.style[key]);
    clone.style.setProperty('visibility', 'hidden', 'important'); node.parentElement.append(clone);
    const defaultColor = getComputedStyle(clone).getPropertyValue(property); clone.remove();
    const color = getComputedStyle(node).getPropertyValue(property);
    this.colorPicker.open({title:name, palette:surface.palette, value:component.style_overrides?.[key] || '',
      color:ViperThemeColors.hex(color) || '#000000', defaultColor, defaultLabel:'Use theme / original color',
      onApply: value => {
        if (root !== this.callbacks.root() || form !== this.callbacks.form() || component !== this.callbacks.selected() || !this.callbacks.editable()) return;
        const input = this.inputs.get(key); input.value = value; input.dispatchEvent(new Event('change'));
      }});
  }
  windowColor() {
    const root = this.callbacks.root(), form = this.callbacks.form(), surface = this.callbacks.surface();
    if (!form || !this.callbacks.editable()) return;
    const settings = form.window, themedDefault = surface.themed && settings.use_theme_background !== false;
    const color = this.windowColorValue();
    this.colorPicker.open({title:'Window background', palette:surface.palette.filter(entry => entry.color.length === 7),
      allowDefault:surface.themed, defaultLabel:'Use theme background',
      defaultColor:surface.palette.find(entry => entry.key === 'background')?.color || settings.background_color,
      value:themedDefault ? '' : settings.background_theme_color ?
        ViperThemeColors.reference(settings.background_theme_color, settings.background_color) : settings.background_color,
      color, opaque:true,
      onApply:(value, color) => {
        if (root !== this.callbacks.root() || form !== this.callbacks.form() || !this.callbacks.editable()) return;
        settings.use_theme_background = !value; settings.background_theme_color = ViperThemeColors.key(value) || '';
        if (value) settings.background_color = ViperThemeColors.hex(color).slice(0, 7);
        this.callbacks.changed();
      }});
  }
  windowColorValue() {
    const surface = this.callbacks.surface(), settings = this.callbacks.form()?.window;
    const node = surface.themed ? surface.root.ownerDocument.body : surface.canvas;
    return ViperThemeColors.hex(getComputedStyle(node).backgroundColor) || settings?.background_color || '#ffffff';
  }
  refresh() {
    const root = this.callbacks.root(), component = this.callbacks.selected(), editable = this.callbacks.editable();
    const themes = new Map(this.library.map(theme => [theme.id, theme.name]));
    for (const [id, theme] of Object.entries(root?.themes || {})) themes.set(id, theme.name);
    this.themeSelect.replaceChildren(new Option('Viper default', ''),
      ...[...themes].map(([id, name]) => new Option(name, id)));
    this.themeSelect.value = root?.active_theme || '';
    this.themeSelect.disabled = !root || !editable;
    for (const id of ['import-theme', 'refresh-themes']) document.getElementById(id).disabled = !root || !editable;
    for (const [key, input] of this.inputs) {
      input.value = component?.style_overrides?.[key] ?? '';
      input.disabled = !component || !editable;
      const node = component ? this.callbacks.control() : null;
      const computed = node ? getComputedStyle(node).getPropertyValue(ViperAppearance.properties[key][0]) : '';
      if (input.tagName === 'INPUT') input.placeholder = computed || 'Theme / default';
      if (this.pickers.has(key)) {
        const picker = this.pickers.get(key);
        picker.disabled = input.disabled;
        this.paintColor(picker, ViperThemeColors.hex(computed) || '#000000', component?.style_overrides?.[key], 'Theme / original');
      }
    }
    for (const property of ['visible', 'enabled']) {
      const input = document.getElementById(`component-${property}`);
      input.checked = component?.[property] !== false; input.disabled = !component || !editable;
    }
    document.getElementById('reset-component-style').disabled = !component || !editable;
    const settings = this.callbacks.form()?.window, background = document.getElementById('window-background');
    background.disabled = !settings || !editable;
    if (settings) {
      const useTheme = this.callbacks.surface().themed && settings.use_theme_background !== false;
      const value = useTheme ? '' : settings.background_theme_color ?
        ViperThemeColors.reference(settings.background_theme_color, settings.background_color) : settings.background_color;
      this.paintColor(background, this.windowColorValue(), value, 'Theme background');
    }
  }
  async choose(id) {
    const root = this.callbacks.root();
    if (!root || !this.callbacks.editable()) return;
    if (id && !root.themes?.[id]) return this.load('theme-load', {id});
    root.active_theme = id || null; this.callbacks.changed();
  }
  async load(command, payload = {}) {
    const root = this.callbacks.root();
    if (!root || !this.callbacks.editable()) return;
    try {
      const theme = await this.callbacks.request(command, payload);
      if (!theme || theme.cancelled || root !== this.callbacks.root()) return;
      if (!root.themes?.[theme.id] && Object.keys(root.themes || {}).length >= 32) throw new Error('A project can store up to 32 themes.');
      root.themes ||= {}; root.themes[theme.id] = {name:theme.name, css:theme.css}; root.active_theme = theme.id;
      if (!this.library.some(item => item.id === theme.id)) this.library.push({id:theme.id, name:theme.name});
      this.callbacks.changed(); this.callbacks.status(`Application theme: ${theme.name}`);
    } catch (error) { this.callbacks.status(`Cannot load theme: ${error.message}`); this.refresh(); }
  }
  async refreshLibrary() {
    const root = this.callbacks.root();
    try {
      this.library = (await this.callbacks.request('theme-list')).themes;
      if (root !== this.callbacks.root()) return;
      if (root?.active_theme && this.library.some(item => item.id === root.active_theme))
        await this.load('theme-load', {id:root.active_theme});
      else this.refresh();
    } catch (error) { this.callbacks.status(`Cannot refresh themes: ${error.message}`); }
  }
}
globalThis.ViperAppearanceInspector = ViperAppearanceInspector;
