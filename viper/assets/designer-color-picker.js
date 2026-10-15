/* Editor-owned dialog: choices are drafts until Apply is pressed. */
class ViperColorPicker {
  constructor() {
    this.dialog = document.createElement('dialog'); this.dialog.id = 'color-picker';
    this.dialog.className = 'color-picker'; this.dialog.setAttribute('aria-labelledby', 'color-picker-title');
    this.dialog.innerHTML = `
      <form id="color-picker-form">
        <h3 id="color-picker-title">Choose color</h3>
        <p class="property-help">Choose a named theme color, or create a custom color below. Apply saves your choice.</p>
        <button id="color-use-default" class="tool-button" type="button">Use theme default</button>
        <h4>Theme palette</h4>
        <p class="property-help">Named colors follow the theme when you switch styles.</p>
        <div id="color-palette" class="color-palette" role="group" aria-label="Theme colors"></div>
        <details id="color-custom"><summary>Custom color</summary>
          <label>Hex or CSS color <input id="color-value" type="text" spellcheck="false" placeholder="#2563eb"></label>
          <div id="color-rgb" class="color-rgb"></div>
        </details>
        <p id="color-error" class="color-error" role="alert"></p>
        <div id="color-preview" class="color-button color-preview" aria-live="polite"></div>
        <div class="dialog-actions"><button id="color-cancel" class="tool-button" type="button">Cancel</button>
          <button id="color-apply" class="tool-button" type="submit">Apply</button></div>
      </form>`;
    document.body.append(this.dialog);
    this.palette = this.dialog.querySelector('#color-palette');
    this.custom = this.dialog.querySelector('#color-value');
    this.error = this.dialog.querySelector('#color-error');
    this.preview = this.dialog.querySelector('#color-preview');
    this.apply = this.dialog.querySelector('#color-apply');
    this.defaultButton = this.dialog.querySelector('#color-use-default');
    this.channels = [];
    for (const [index, name] of ['Red', 'Green', 'Blue'].entries()) {
      const label = document.createElement('label'); label.textContent = name;
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = 0; slider.max = 255;
      slider.setAttribute('aria-label', name);
      const number = document.createElement('input'); number.type = 'number'; number.min = 0; number.max = 255; number.step = 1;
      number.setAttribute('aria-label', `${name} value`);
      const change = value => {
        if (!Number.isFinite(Number(value)) || value === '' || Number(value) < 0 || Number(value) > 255) { this.invalid('RGB values must be between 0 and 255.'); return; }
        const values = this.channels.map(channel => Number(channel.number.value)); values[index] = Math.round(Number(value));
        this.setCustom('#' + values.map(part => part.toString(16).padStart(2, '0')).join(''));
      };
      slider.oninput = () => change(slider.value); number.oninput = () => change(number.value);
      label.append(slider, number); this.dialog.querySelector('#color-rgb').append(label);
      this.channels.push({slider, number});
    }
    this.custom.oninput = () => this.setCustom(this.custom.value, false);
    this.defaultButton.onclick = () => this.select('', this.options.defaultColor, this.options.defaultLabel);
    this.dialog.querySelector('#color-cancel').onclick = () => this.dialog.close();
    this.dialog.querySelector('form').onsubmit = event => {
      event.preventDefault(); if (this.apply.disabled) return;
      const {value, color} = this.draft, commit = this.options.onApply;
      this.dialog.close(); commit(value, color);
    };
    this.dialog.addEventListener('keydown', event => event.stopPropagation());
    this.palette.onkeydown = event => {
      const buttons = [...this.palette.children], index = buttons.indexOf(event.target);
      if (index < 0) return;
      const columns = getComputedStyle(this.palette).gridTemplateColumns.split(' ').length;
      const offset = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-columns, ArrowDown:columns}[event.key];
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : offset === undefined ? null :
        Math.max(0, Math.min(buttons.length - 1, index + offset));
      if (next === null) return;
      event.preventDefault(); buttons[next].focus(); buttons[next].click();
    };
  }
  static paint(button, color, label) {
    const chip = document.createElement('span'); chip.className = 'color-chip'; chip.setAttribute('aria-hidden', 'true');
    chip.style.setProperty('--swatch-color', color);
    const text = document.createElement('span'); text.className = 'color-button-label'; text.textContent = label;
    button.replaceChildren(chip, text); button.title = `${label} · ${color}`;
    button.dataset.color = color; button.value = color;
  }
  open(options) {
    if (this.dialog.open) this.dialog.close();
    this.options = options; this.palette.replaceChildren();
    this.dialog.querySelector('#color-picker-title').textContent = options.title;
    this.defaultButton.hidden = options.allowDefault === false;
    this.defaultButton.textContent = options.defaultLabel;
    for (const entry of options.palette) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'color-button palette-swatch';
      button.dataset.key = entry.key; button.setAttribute('aria-pressed', 'false');
      ViperColorPicker.paint(button, entry.color, entry.label);
      button.onclick = () => this.select(entry.value, entry.color, entry.label);
      this.palette.append(button);
    }
    this.dialog.querySelector('#color-custom').open = false;
    const key = ViperThemeColors.key(options.value), selected = options.palette.find(entry => entry.key === key);
    this.select(options.value || '', selected?.color || options.color,
      !options.value ? options.defaultLabel : selected?.label || options.color.toUpperCase());
    this.dialog.showModal();
  }
  select(value, color, label) {
    this.draft = {value, color}; this.error.textContent = ''; this.apply.disabled = false;
    ViperColorPicker.paint(this.preview, color, label);
    this.custom.value = color;
    const hex = ViperThemeColors.hex(color) || '#000000';
    this.channels.forEach(({slider, number}, index) => { slider.value = number.value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16); });
    const key = ViperThemeColors.key(value);
    const active = [...this.palette.children].find(button => button.dataset.key === key) || this.palette.firstElementChild;
    for (const button of this.palette.children) {
      button.setAttribute('aria-pressed', String(button.dataset.key === key)); button.tabIndex = button === active ? 0 : -1;
    }
    this.defaultButton.setAttribute('aria-pressed', String(!value));
  }
  invalid(message) { this.error.textContent = message; this.apply.disabled = true; }
  setCustom(value, updateText = true) {
    const color = ViperThemeColors.hex(value.trim());
    if (!color) { this.invalid('Enter a valid color, for example #2563eb or royalblue.'); return; }
    if (this.options.opaque && color.length !== 7) { this.invalid('Choose an opaque window background color.'); return; }
    const original = this.custom.value;
    this.select(color, color, color.toUpperCase());
    if (!updateText) this.custom.value = original;
  }
}
globalThis.ViperColorPicker = ViperColorPicker;
