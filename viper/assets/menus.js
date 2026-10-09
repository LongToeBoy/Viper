/* Permanent application chrome. Menu definitions contain only action IDs. */
class ViperMenus {
  constructor(registry, chrome, definitions, tools) {
    this.registry = registry; this.chrome = chrome; this.definitions = definitions;
    this.popups = []; this.bindings = new Map();
    this.bar = chrome.querySelector('[role="menubar"]');
    this.layer = chrome.querySelector('.menu-layer');
    this.buttons = definitions.map((menu, index) => {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = menu.name; button.className = 'menu-heading';
      button.setAttribute('role', 'menuitem'); button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false'); button.tabIndex = index ? -1 : 0;
      button.onclick = () => this.rootIndex === index ? this.close() : this.openRoot(index);
      button.onmouseenter = () => { if (this.rootIndex !== undefined) this.openRoot(index); };
      button.onkeydown = event => this.headingKey(event, index);
      this.bar.appendChild(button); return button;
    });
    const toolbar = chrome.querySelector('[role="toolbar"]');
    for (const id of tools) {
      if (!id) { const separator = document.createElement('span'); separator.className = 'toolbar-separator';
        separator.setAttribute('role', 'separator'); toolbar.appendChild(separator); continue; }
      const button = this.actionButton(id, false); button.id = id;
      button.className = 'toolbar-action'; toolbar.appendChild(button);
    }
    registry.subscribe(() => this.refresh()); this.refresh();
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest('.menu-popup, .menu-heading')) this.close(false);
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.popups.length) {
        event.preventDefault(); event.stopImmediatePropagation(); this.close(); return;
      }
      if (event.key === 'Tab') this.close(false);
      const mnemonic = event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey
        ? definitions.findIndex(menu => menu.name[0].toLowerCase() === event.key.toLowerCase()) : -1;
      if ((event.key === 'F10' && !event.shiftKey) || mnemonic >= 0) {
        event.preventDefault();
        if (mnemonic >= 0) this.openRoot(mnemonic);
        else { this.buttons.forEach((button, i) => { button.tabIndex = i ? -1 : 0; }); this.buttons[0].focus(); }
      }
    }, true);
    window.addEventListener('resize', () => this.close(false));
    document.addEventListener('scroll', event => {
      if (!event.target.closest?.('.menu-popup')) this.close(false);
    }, true);
    document.addEventListener('focusin', event => {
      if (this.popups.length && !this.chrome.contains(event.target)) this.close(false);
    });
  }
  actionButton(id, menu) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.action = id;
    const icon = document.createElement('span'); icon.className = 'action-icon'; icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.className = 'action-name';
    const shortcut = document.createElement('span'); shortcut.className = 'action-shortcut'; shortcut.setAttribute('aria-hidden', 'true');
    button.append(icon, name, shortcut);
    if (menu) { button.className = 'menu-item'; button.tabIndex = -1; }
    button.onclick = () => { this.close(); this.registry.execute(id); };
    this.bindings.set(button, {id, menu}); return button;
  }
  refresh() {
    for (const [button, binding] of this.bindings) {
      const action = this.registry.state(binding.id), toggle = action.checked !== null;
      button.disabled = !action.enabled;
      const icon = button.querySelector('.action-icon');
      icon.replaceChildren();
      if (binding.menu && toggle) icon.textContent = action.checked ? '✓' : '';
      else if (ViperMenus.icons[action.icon]) {
        const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
        svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('stroke-linecap', 'round');
        const path = document.createElementNS(ns, 'path'); path.setAttribute('d', ViperMenus.icons[action.icon]);
        svg.appendChild(path); icon.appendChild(svg);
      } else icon.textContent = action.icon;
      button.querySelector('.action-name').textContent = !binding.menu && action.toolbarLabel ? action.toolbarLabel : action.name;
      button.querySelector('.action-shortcut').textContent = action.shortcut;
      button.title = [action.name, action.shortcut, !action.enabled && action.reason].filter(Boolean).join(' — ');
      button.setAttribute('aria-label', action.name);
      button.classList.toggle('checked', !!action.checked);
      if (binding.menu) {
        button.setAttribute('role', toggle ? 'menuitemcheckbox' : 'menuitem');
        button.setAttribute('aria-disabled', String(!action.enabled));
        if (toggle) button.setAttribute('aria-checked', String(action.checked));
      } else if (toggle) button.setAttribute('aria-pressed', String(action.checked));
    }
  }
  closeAfter(depth) {
    for (const popup of this.popups.splice(depth)) {
      popup.owner?.setAttribute('aria-expanded', 'false');
      for (const button of popup.node.querySelectorAll('[data-action]')) this.bindings.delete(button);
      popup.node.remove();
    }
  }
  close(restore = true) {
    const focus = this.returnFocus, wasOpen = this.popups.length > 0;
    this.closeAfter(0); this.rootIndex = undefined;
    this.returnFocus = null;
    for (const button of this.buttons) button.setAttribute('aria-expanded', 'false');
    if (restore && wasOpen && focus?.isConnected) focus.focus();
  }
  openRoot(index) {
    this.close(false); this.rootIndex = index; this.returnFocus = this.buttons[index];
    this.buttons.forEach((button, i) => { button.tabIndex = i === index ? 0 : -1; });
    const rect = this.buttons[index].getBoundingClientRect();
    this.open(this.definitions[index].items, this.buttons[index], 0, rect.left, this.chrome.getBoundingClientRect().bottom);
  }
  context(items, x, y, returnFocus) {
    this.close(false); this.returnFocus = returnFocus;
    this.open(items, null, 0, x, y);
  }
  open(items, owner, depth, x, y) {
    this.closeAfter(depth);
    const node = document.createElement('div'); node.className = 'menu-popup'; node.setAttribute('role', 'menu'); node.tabIndex = -1;
    node.setAttribute('aria-label', owner?.textContent || 'Element commands');
    owner?.setAttribute('aria-expanded', 'true');
    for (const entry of items) {
      if (!entry) { const separator = document.createElement('div'); separator.className = 'menu-separator';
        separator.setAttribute('role', 'separator'); node.appendChild(separator); continue; }
      const button = typeof entry === 'string' ? this.actionButton(entry, true) : document.createElement('button');
      if (typeof entry !== 'string') {
        button.type = 'button'; button.className = 'menu-item submenu-heading'; button.tabIndex = -1;
        button.textContent = entry.name; button.setAttribute('role', 'menuitem');
        button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
        const expand = focus => {
          const rect = button.getBoundingClientRect();
          this.open(entry.items, button, depth + 1, rect.right, rect.top);
          if (!focus) button.focus();
        };
        button.onclick = () => expand(true); button.onmouseenter = () => expand(false);
        button.onkeydown = event => { if (event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); expand(true); } };
      } else button.onmouseenter = () => { this.closeAfter(depth + 1); if (!button.disabled) button.focus(); };
      node.appendChild(button);
    }
    node.onkeydown = event => this.popupKey(event, depth);
    this.layer.appendChild(node); this.popups.push({node, owner}); this.refresh();
    const top = this.chrome.getBoundingClientRect().bottom, margin = 4;
    node.style.maxHeight = `${Math.max(0, window.innerHeight - top - margin)}px`;
    node.style.maxWidth = `${Math.max(0, window.innerWidth - margin * 2)}px`;
    const rect = node.getBoundingClientRect();
    if (depth && x + rect.width > window.innerWidth - margin) x = owner.getBoundingClientRect().left - rect.width;
    node.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))}px`;
    node.style.top = `${Math.max(top, Math.min(y, window.innerHeight - rect.height - margin))}px`;
    (node.querySelector('button:not(:disabled)') || node).focus();
  }
  headingKey(event, index) {
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + this.buttons.length) % this.buttons.length;
      this.buttons.forEach((button, i) => { button.tabIndex = i === next ? 0 : -1; }); this.buttons[next].focus();
      if (this.popups.length) this.openRoot(next);
    } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); this.openRoot(index);
      if (event.key === 'ArrowUp') [...this.popups[0].node.querySelectorAll('button:not(:disabled)')].at(-1)?.focus();
    }
  }
  popupKey(event, depth) {
    const popup = this.popups[depth], rows = [...popup.node.querySelectorAll('button:not(:disabled)')];
    const current = rows.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 :
        (current + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[next]?.focus(); this.closeAfter(depth + 1);
    } else if (event.key === 'ArrowLeft' && depth) {
      event.preventDefault(); const owner = popup.owner; this.closeAfter(depth); owner.focus();
    } else if (['ArrowLeft', 'ArrowRight'].includes(event.key) && this.rootIndex !== undefined) {
      event.preventDefault(); this.openRoot((this.rootIndex + (event.key === 'ArrowRight' ? 1 : -1) + this.buttons.length) % this.buttons.length);
    }
  }
}
ViperMenus.icons = {
  save: 'M3 3h11l3 3v11H3z M6 3v5h7V3 M6 17v-6h8v6',
  undo: 'M7 3 3 7l4 4 M3 7h9a5 5 0 0 1 0 10',
  redo: 'm13 3 4 4-4 4 M17 7H8a5 5 0 0 0 0 10',
  grid: 'M3 3h14v14H3z M3 8h14 M3 13h14 M8 3v14 M13 3v14',
  snap: 'M3 4h4v4H3z M13 12h4v4h-4z M7 6h8v6 M15 6V3',
  preview: 'M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z M10 7a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  run: 'm6 3 11 7-11 7z'
};
globalThis.ViperMenus = ViperMenus;
