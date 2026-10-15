/* Project -> sibling windows -> components. This is an editor view of shared definitions. */
class ViperProjectExplorer {
  static key(item) { return JSON.stringify([item.kind, item.formId || '', item.componentId || '']); }
  constructor(element, callbacks) {
    this.element = element; this.callbacks = callbacks; this.collapsed = new Set(); this.nodes = new Map();
    element.addEventListener('keydown', event => this.keyDown(event));
  }
  reset() { this.collapsed.clear(); this.focused = null; this.signature = null; }
  reveal(item) {
    if (item.kind !== 'project') this.collapsed.delete(ViperProjectExplorer.key({kind: 'project'}));
    if (item.kind === 'component') this.collapsed.delete(ViperProjectExplorer.key({kind: 'window', formId: item.formId}));
  }
  render() {
    const root = this.callbacks.root(), selection = this.callbacks.selection();
    const selectedKey = ViperProjectExplorer.key(selection);
    const signature = JSON.stringify([root && [root.name, root.startup_window_id, root.windows.map(form =>
      [form.form_id, form.window.name, form.components.map(component => [component.id, component.name, component.visible])])], [...this.collapsed].sort()]);
    // Selection does not replace tree rows: native double-clicks and keyboard
    // focus must survive the first click of a double-click gesture.
    if (signature === this.signature) {
      for (const [key, record] of this.nodes) record.node.setAttribute('aria-selected', String(key === selectedKey));
      return;
    }
    this.signature = signature;
    const hadFocus = this.element.contains(document.activeElement), scroll = this.element.parentElement.scrollTop;
    const focused = document.activeElement?.closest('[role=treeitem]')?.dataset.node;
    this.element.replaceChildren(); this.nodes.clear(); this.rows = [];
    if (!root) { this.element.textContent = 'Open or create a project.'; return; }
    const add = (parent, item, label, depth, parentKey, children = [], badge = '') => {
      const key = ViperProjectExplorer.key(item), branch = item.kind !== 'component';
      const node = document.createElement('li'); node.setAttribute('role', 'treeitem'); node.tabIndex = -1;
      node.dataset.node = key; node.dataset.kind = item.kind;
      if (item.formId) node.dataset.form = item.formId;
      if (item.componentId) node.dataset.component = item.componentId;
      node.setAttribute('aria-level', String(depth)); node.setAttribute('aria-label', `${label}${badge ? ` (${badge})` : ''}`);
      node.setAttribute('aria-selected', String(key === selectedKey));
      const row = document.createElement('div'); row.className = 'explorer-row'; row.style.paddingLeft = `${(depth - 1) * 16 + 4}px`;
      const disclosure = document.createElement('span'); disclosure.className = 'tree-disclosure'; disclosure.setAttribute('aria-hidden', 'true');
      if (branch) {
        const expanded = !this.collapsed.has(key); node.setAttribute('aria-expanded', String(expanded));
        disclosure.textContent = expanded ? '▾' : '▸';
        disclosure.onclick = event => { event.stopPropagation(); this.toggle(key); };
      }
      const icon = document.createElement('span'); icon.className = `tree-icon tree-${item.kind}`; icon.setAttribute('aria-hidden', 'true');
      icon.textContent = item.kind === 'project' ? '◇' : item.kind === 'window' ? '▣' : '▪';
      const text = document.createElement('span'); text.className = 'tree-name'; text.textContent = label;
      row.append(disclosure, icon, text);
      if (badge) { const mark = document.createElement('span'); mark.className = 'tree-badge'; mark.textContent = badge; row.appendChild(mark); }
      node.appendChild(row); parent.appendChild(node);
      this.nodes.set(key, {node, item, parentKey}); this.rows.push(key);
      row.onclick = () => this.choose(key);
      row.ondblclick = event => { event.preventDefault(); if (item.kind === 'component') this.callbacks.events(item); else this.callbacks.properties(item); };
      row.oncontextmenu = event => {
        event.preventDefault(); event.stopPropagation();
        if (!this.callbacks.editable()) return;
        this.choose(key); this.callbacks.context(item, event.clientX, event.clientY, this.nodes.get(key)?.node || this.element);
      };
      if (branch && !this.collapsed.has(key)) {
        const group = document.createElement('ul'); group.setAttribute('role', 'group'); node.appendChild(group);
        for (const child of children) add(group, child.item, child.label, depth + 1, key, child.children, child.badge);
      }
    };
    const windows = root.windows.map(form => ({item: {kind: 'window', formId: form.form_id}, label: form.window.name,
      badge: root.startup_window_id === form.form_id ? 'Startup' : '', children: form.components.map(component => ({
        item: {kind: 'component', formId: form.form_id, componentId: component.id}, label: component.name,
        badge: component.visible === false ? 'Hidden' : '', children: []}))}));
    add(this.element, {kind: 'project'}, root.name, 1, null, windows);
    this.focused = [focused, this.focused, selectedKey, this.rows[0]].find(key => this.nodes.has(key));
    const node = this.nodes.get(this.focused)?.node;
    if (node) { node.tabIndex = 0; if (hadFocus) node.focus({preventScroll: true}); }
    this.element.parentElement.scrollTop = scroll;
  }
  choose(key) {
    const record = this.nodes.get(key); if (!record) return;
    this.focused = key; this.callbacks.select(record.item);
    this.focus(key);
  }
  focus(key) {
    for (const [candidate, record] of this.nodes) record.node.tabIndex = candidate === key ? 0 : -1;
    this.nodes.get(key)?.node.focus({preventScroll: true});
  }
  toggle(key) {
    if (this.collapsed.has(key)) this.collapsed.delete(key); else this.collapsed.add(key);
    this.focused = key; this.render(); this.focus(key);
  }
  keyDown(event) {
    const key = event.target.closest('[role=treeitem]')?.dataset.node, record = this.nodes.get(key);
    if (!record) return;
    const index = this.rows.indexOf(key), branch = record.item.kind !== 'component'; let next;
    if (event.key === 'ArrowDown') next = this.rows[Math.min(this.rows.length - 1, index + 1)];
    else if (event.key === 'ArrowUp') next = this.rows[Math.max(0, index - 1)];
    else if (event.key === 'Home') next = this.rows[0];
    else if (event.key === 'End') next = this.rows.at(-1);
    else if (event.key === 'ArrowRight' && branch) {
      if (this.collapsed.has(key)) this.toggle(key);
      else if (this.nodes.get(this.rows[index + 1])?.parentKey === key) next = this.rows[index + 1];
    } else if (event.key === 'ArrowLeft') {
      if (branch && !this.collapsed.has(key)) this.toggle(key); else next = record.parentKey;
    } else if (event.key === 'Enter' || event.key === ' ') next = key;
    else return;
    event.preventDefault(); event.stopPropagation(); if (next) this.choose(next);
  }
}
globalThis.ViperProjectExplorer = ViperProjectExplorer;
