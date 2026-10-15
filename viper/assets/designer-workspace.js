/* Movable editor tools. Layout is local editor state, never application data. */
class ViperDesignerWorkspace {
  static key = 'viper.designer.workspace.v1';
  static sides = ['left', 'right', 'top', 'bottom'];
  static clone(value) { return JSON.parse(JSON.stringify(value)); }
  static defaults(definitions) {
    const state = {version: 1, sizes: {left: 220, right: 260, top: 180, bottom: 200}, groups: [], closed: []};
    for (const tool of definitions) {
      const location = tool.location || 'left', rect = {x: 40, y: 40, width: 300, height: 400};
      if (tool.visible === false) { state.closed.push({tool: tool.id, group: `dock-${location}`, location, rect}); continue; }
      let group = state.groups.find(group => group.location === location);
      if (!group) { group = {id: `dock-${location}`, location, tools: [], active: tool.id, rect}; state.groups.push(group); }
      group.tools.push(tool.id);
    }
    return state;
  }
  static normalize(saved, definitions) {
    if (!saved || saved.version !== 1 || !Array.isArray(saved.groups) || !Array.isArray(saved.closed)) throw new Error('Invalid workspace layout');
    const known = new Set(definitions.map(tool => tool.id)), used = new Set(), ids = new Set(), sides = new Set();
    const validLocation = location => location === 'floating' || this.sides.includes(location);
    const rectangle = rect => {
      if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) ||
          rect.x < 0 || rect.y < 0 || rect.width < 100 || rect.height < 80 ||
          Object.values(rect).some(value => value > 100000)) throw new Error('Invalid panel rectangle');
      return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
    };
    const claim = tool => {
      if (used.has(tool)) throw new Error('A tool cannot appear twice in a workspace');
      used.add(tool); return tool;
    };
    const state = {version: 1, sizes: {}, groups: [], closed: []};
    for (const side of this.sides) {
      const size = saved.sizes?.[side];
      if (!Number.isFinite(size) || size < 80 || size > 4000) throw new Error('Invalid dock size');
      state.sizes[side] = size;
    }
    for (const record of saved.groups) {
      if (typeof record.id !== 'string' || !record.id || ids.has(record.id) || !validLocation(record.location) || !Array.isArray(record.tools)) throw new Error('Invalid tool group');
      ids.add(record.id);
      const tools = record.tools.filter(tool => known.has(tool)).map(claim);
      if (!tools.length) continue;
      if (record.location !== 'floating' && sides.has(record.location)) throw new Error('Each side has one dock group');
      sides.add(record.location);
      state.groups.push({id: record.id, location: record.location, tools,
        active: tools.includes(record.active) ? record.active : tools[0], rect: rectangle(record.rect)});
    }
    for (const record of saved.closed) {
      if (!known.has(record.tool)) continue;
      if (!validLocation(record.location) || typeof record.group !== 'string') throw new Error('Invalid closed tool');
      state.closed.push({tool: claim(record.tool), group: record.group, location: record.location, rect: rectangle(record.rect)});
    }
    // A newly registered tool can join an existing workspace without resetting it.
    for (const definition of definitions) if (!used.has(definition.id)) {
      if (definition.visible === true) {
        const location = definition.location || 'left';
        let group = state.groups.find(group => group.location === location);
        if (!group) {
          let id = `dock-${location}`, suffix = 2;
          while (state.groups.some(group => group.id === id) || state.closed.some(record => record.group === id)) id = `dock-${location}-${suffix++}`;
          group = {id, location, tools: [], active: definition.id, rect: {x: 40, y: 40, width: 300, height: 400}};
          state.groups.push(group);
        }
        group.tools.push(definition.id); group.active = definition.id; continue;
      }
      state.closed.push({tool: definition.id, group: `dock-${definition.location || 'left'}`,
        location: definition.location || 'left', rect: {x: 40, y: 40, width: 300, height: 400}});
    }
    return state;
  }
  constructor(root, definitions, options = {}) {
    this.root = root; this.definitions = definitions; this.storage = options.storage;
    this.changed = options.changed || (() => {});
    this.tools = new Map(definitions.map(tool => [tool.id, tool]));
    this.groupNodes = new Map(); this.nextGroup = 0; this.gesture = null;
    this.parking = root.querySelector('#tool-parking');
    this.floating = root.querySelector('#floating-tools');
    this.targets = root.querySelector('#dock-targets');
    let saved;
    try { saved = this.storage?.getItem(ViperDesignerWorkspace.key); } catch (_) { /* Session layout. */ }
    try { this.state = saved ? ViperDesignerWorkspace.normalize(JSON.parse(saved), definitions) : ViperDesignerWorkspace.defaults(definitions); }
    catch (_) { this.state = ViperDesignerWorkspace.defaults(definitions); }
    if (!saved && options.inspectorVisible === false) this.hide('inspector', false);
    this.pointerDown = event => this.startGesture(event);
    this.pointerMove = event => this.moveGesture(event);
    this.pointerUp = event => this.endGesture(event);
    this.pointerCancel = event => { if (this.gesture?.pointerId === event.pointerId) this.cancelGesture(); };
    this.keyDown = event => {
      if (event.key === 'Escape' && this.gesture) { event.preventDefault(); event.stopImmediatePropagation(); this.cancelGesture(); }
    };
    root.addEventListener('pointerdown', this.pointerDown);
    document.addEventListener('pointermove', this.pointerMove);
    document.addEventListener('pointerup', this.pointerUp);
    document.addEventListener('pointercancel', this.pointerCancel);
    root.addEventListener('lostpointercapture', this.pointerCancel);
    document.addEventListener('keydown', this.keyDown, true);
    root.addEventListener('click', event => {
      if (this.suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); this.suppressClick = false; }
    }, true);
    this.observer = new ResizeObserver(() => {
      this.applyGeometry(); if (this.gesture?.started && this.gesture.kind === 'move') this.showTargets();
    });
    this.observer.observe(root);
    this.render();
  }
  snapshot() { return ViperDesignerWorkspace.clone(this.state); }
  restore(state) { this.cancelGesture(); this.state = ViperDesignerWorkspace.normalize(state, this.definitions); this.commit(); }
  reset() { this.cancelGesture(); this.state = ViperDesignerWorkspace.defaults(this.definitions); this.commit(); }
  groupFor(tool) { return this.state.groups.find(group => group.tools.includes(tool)); }
  isOpen(tool) { return !!this.groupFor(tool); }
  isActive(tool) { return this.groupFor(tool)?.active === tool; }
  persist() {
    try { this.storage?.setItem(ViperDesignerWorkspace.key, JSON.stringify(this.state)); } catch (_) { /* Keep the session layout. */ }
  }
  commit() { this.render(); this.persist(); this.changed(); }
  removeTools(tools) {
    for (const group of this.state.groups) {
      group.tools = group.tools.filter(tool => !tools.includes(tool));
      if (!group.tools.includes(group.active)) group.active = group.tools[0];
    }
    this.state.groups = this.state.groups.filter(group => group.tools.length);
    this.state.closed = this.state.closed.filter(record => !tools.includes(record.tool));
  }
  hide(tool, commit = true) {
    const group = this.groupFor(tool); if (!group) return;
    const record = {tool, group: group.id, location: group.location, rect: {...group.rect}};
    this.removeTools([tool]); this.state.closed.push(record);
    if (commit) this.commit();
  }
  show(tool) {
    if (!this.tools.has(tool)) return;
    let group = this.groupFor(tool);
    if (!group) {
      const record = this.state.closed.find(record => record.tool === tool);
      if (!record) return;
      group = this.state.groups.find(group => group.id === record.group) ||
        this.state.groups.find(group => group.location !== 'floating' && group.location === record.location);
      if (!group) {
        group = {id: record.group || this.uniqueId(), location: record.location, rect: {...record.rect}, tools: [], active: tool};
        this.state.groups.push(group);
      }
      group.tools.push(tool); this.state.closed = this.state.closed.filter(record => record.tool !== tool);
    }
    group.active = tool; this.commit(); this.raise(group);
  }
  toggle(tool) { if (this.isOpen(tool)) this.hide(tool); else this.show(tool); }
  uniqueId() {
    let id;
    do { id = `tools-${++this.nextGroup}`; } while (this.state.groups.some(group => group.id === id) || this.state.closed.some(record => record.group === id));
    return id;
  }
  moveTools(tools, destination, groupId) {
    this.removeTools(tools);
    let group = destination.groupId ? this.state.groups.find(group => group.id === destination.groupId) :
      destination.location !== 'floating' ? this.state.groups.find(group => group.location === destination.location) : null;
    if (!group) {
      group = {id: groupId || this.uniqueId(), location: destination.location || 'floating', tools: [],
        active: tools[0], rect: destination.rect || {x: 40, y: 40, width: 300, height: 400}};
      this.state.groups.push(group);
    }
    group.tools.push(...tools); group.active = tools[0]; return group;
  }
  dock(tool, side) {
    if (!ViperDesignerWorkspace.sides.includes(side) || !this.groupFor(tool)) return;
    this.moveTools([tool], {location: side}); this.commit();
  }
  float(tool) {
    const group = this.groupFor(tool); if (!group) return;
    if (group.location === 'floating' && group.tools.length === 1) { this.raise(group); return; }
    const bounds = this.groupNodes.get(group.id).getBoundingClientRect(), root = this.root.getBoundingClientRect();
    this.moveTools([tool], {location: 'floating', rect: {x: Math.max(0, bounds.left - root.left + 20),
      y: Math.max(0, bounds.top - root.top + 20), width: Math.max(240, bounds.width), height: Math.max(240, bounds.height)}});
    this.commit();
  }
  raise(group) {
    if (group.location !== 'floating') return;
    this.state.groups = [...this.state.groups.filter(item => item !== group), group];
    let z = 1;
    for (const item of this.state.groups) if (item.location === 'floating') this.groupNodes.get(item.id).style.zIndex = z++;
    this.persist();
  }
  render() {
    const focus = document.activeElement, keepFocus = this.definitions.some(tool => tool.element.contains(focus));
    const selection = keepFocus && typeof focus.selectionStart === 'number' ? [focus.selectionStart, focus.selectionEnd] : null;
    const scroll = this.definitions.map(tool => [tool.element, tool.element.scrollTop]);
    for (const tool of this.definitions) { this.parking.appendChild(tool.element); tool.element.hidden = true; }
    this.floating.replaceChildren(); this.groupNodes.clear();
    for (const side of ViperDesignerWorkspace.sides) {
      const slot = this.root.querySelector(`#dock-${side}`); slot.replaceChildren(); slot.hidden = true;
    }
    for (const group of this.state.groups) {
      const node = document.createElement('section'); node.className = 'tool-group'; node.dataset.group = group.id;
      node.setAttribute('aria-label', `${this.tools.get(group.active).title} tools`);
      node.classList.toggle('floating', group.location === 'floating');
      const header = document.createElement('div'); header.className = 'panel-header';
      header.title = 'Drag this title bar to move the tool group';
      const title = document.createElement('span'); title.className = 'panel-title';
      title.textContent = group.tools.length > 1 ? 'Tools' : this.tools.get(group.active).title;
      const placement = document.createElement('select'); placement.className = 'panel-placement';
      placement.setAttribute('aria-label', `Move ${this.tools.get(group.active).title} panel`);
      placement.title = 'Float or dock the active tool';
      placement.append(new Option('↗', ''), new Option('Float', 'floating'), ...ViperDesignerWorkspace.sides.map(side => new Option(`Dock ${side}`, side)));
      placement.onchange = () => { if (placement.value === 'floating') this.float(group.active); else this.dock(group.active, placement.value); };
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
      close.setAttribute('aria-label', `Close ${this.tools.get(group.active).title}`); close.title = `Close ${this.tools.get(group.active).title}`;
      close.onclick = () => this.hide(group.active); header.append(title, placement, close);
      const tabs = document.createElement('div'); tabs.className = 'panel-tabs'; tabs.hidden = group.tools.length === 1;
      tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Tools in this group');
      const content = document.createElement('div'); content.className = 'panel-content';
      for (const toolId of group.tools) {
        const tool = this.tools.get(toolId), tab = document.createElement('button'); tab.type = 'button';
        tab.className = 'panel-tab'; tab.dataset.tool = toolId; tab.textContent = tool.title;
        tab.title = 'Drag this tab to move only this tool'; tab.id = `tool-tab-${toolId}`;
        tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(group.active === toolId));
        tab.setAttribute('aria-controls', tool.element.id); tab.tabIndex = group.active === toolId ? 0 : -1;
        tab.onclick = () => this.show(toolId);
        tab.onkeydown = event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const index = group.tools.indexOf(toolId), count = group.tools.length;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
          this.show(group.tools[next]); document.getElementById(`tool-tab-${group.tools[next]}`).focus();
        };
        tabs.appendChild(tab); tool.element.hidden = group.active !== toolId;
        tool.element.setAttribute('role', 'tabpanel'); tool.element.setAttribute('aria-label', tool.title);
        if (group.tools.length > 1) tool.element.setAttribute('aria-labelledby', tab.id); else tool.element.removeAttribute('aria-labelledby');
        content.appendChild(tool.element);
      }
      node.append(header, tabs, content); this.groupNodes.set(group.id, node);
      if (group.location === 'floating') {
        const resize = document.createElement('button'); resize.className = 'floating-resizer'; resize.type = 'button';
        resize.setAttribute('aria-label', `Resize ${this.tools.get(group.active).title} floating group`);
        resize.onkeydown = event => this.resizeWithKey(event, group);
        node.appendChild(resize); this.floating.appendChild(node);
      } else {
        const slot = this.root.querySelector(`#dock-${group.location}`); slot.hidden = false; slot.appendChild(node);
        const splitter = document.createElement('div'); splitter.className = 'dock-splitter'; splitter.dataset.side = group.location;
        splitter.setAttribute('role', 'separator'); splitter.tabIndex = 0;
        splitter.setAttribute('aria-label', `Resize ${group.location} dock`);
        splitter.setAttribute('aria-orientation', ['left', 'right'].includes(group.location) ? 'vertical' : 'horizontal');
        splitter.onkeydown = event => this.resizeWithKey(event, group); slot.appendChild(splitter);
      }
    }
    this.applyGeometry();
    for (const [element, top] of scroll) element.scrollTop = top;
    if (keepFocus && !focus.closest('[hidden]')) { focus.focus({preventScroll: true}); if (selection) focus.setSelectionRange(...selection); }
  }
  applyGeometry() {
    const width = this.root.clientWidth, height = this.root.clientHeight;
    const occupied = side => this.state.groups.some(group => group.location === side) ? this.state.sizes[side] : 0;
    const fit = (a, b, budget) => { const scale = Math.min(1, Math.max(0, budget) / Math.max(1, a + b)); return [a * scale, b * scale]; };
    const [left, right] = fit(occupied('left'), occupied('right'), width - Math.min(160, width * .55));
    const [top, bottom] = fit(occupied('top'), occupied('bottom'), height - Math.min(140, height * .55));
    for (const [side, size] of Object.entries({left, right, top, bottom})) this.root.style.setProperty(`--dock-${side}`, `${size}px`);
    let z = 1;
    for (const group of this.state.groups) if (group.location === 'floating') {
      const node = this.groupNodes.get(group.id); if (!node) continue;
      const w = Math.min(width, group.rect.width), h = Math.min(height, group.rect.height);
      Object.assign(node.style, {width: `${w}px`, height: `${h}px`, left: `${Math.min(group.rect.x, Math.max(0, width - w))}px`,
        top: `${Math.min(group.rect.y, Math.max(0, height - h))}px`, zIndex: z++});
    }
    for (const splitter of this.root.querySelectorAll('.dock-splitter')) splitter.setAttribute('aria-valuenow', String(Math.round(this.state.sizes[splitter.dataset.side])));
  }
  resizeWithKey(event, group) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key), amount = event.shiftKey ? 40 : 12;
    const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -amount : amount;
    if (group.location !== 'floating' && horizontal !== ['left', 'right'].includes(group.location)) return;
    event.preventDefault(); event.stopPropagation();
    if (group.location === 'floating') {
      const key = horizontal ? 'width' : 'height'; group.rect[key] = Math.max(key === 'width' ? 180 : 120, Math.min(4000, group.rect[key] + delta));
    } else this.state.sizes[group.location] = Math.max(100, Math.min(4000, this.state.sizes[group.location] + delta * (['right', 'bottom'].includes(group.location) ? -1 : 1)));
    this.applyGeometry(); this.persist(); this.changed();
  }
  startGesture(event) {
    if (event.button !== 0 || this.gesture) return;
    const node = event.target.closest('.tool-group'), splitter = event.target.closest('.dock-splitter');
    if (node) this.raise(this.state.groups.find(group => group.id === node.dataset.group));
    const tab = event.target.closest('.panel-tab'), header = event.target.closest('.panel-header'), resize = event.target.closest('.floating-resizer');
    if (!splitter && !resize && !tab && (!header || event.target.closest('button, select'))) return;
    const group = this.state.groups.find(group => splitter ? group.location === splitter.dataset.side : group.id === node.dataset.group);
    if (!group) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = this.groupNodes.get(group.id).getBoundingClientRect(), root = this.root.getBoundingClientRect();
    this.gesture = {pointerId: event.pointerId, kind: splitter || resize ? 'resize' : 'move', groupId: group.id,
      tools: tab ? [tab.dataset.tool] : [...group.tools], original: this.snapshot(), started: false,
      x: event.clientX, y: event.clientY, side: splitter?.dataset.side,
      bounds: {x: bounds.left - root.left, y: bounds.top - root.top, width: bounds.width, height: bounds.height}};
    this.root.setPointerCapture(event.pointerId);
  }
  moveGesture(event) {
    const gesture = this.gesture; if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.started && Math.abs(dx) + Math.abs(dy) < 4) return;
    event.preventDefault();
    if (!gesture.started) {
      gesture.started = true; this.root.classList.add('workspace-dragging');
      if (gesture.kind === 'move') {
        const entire = this.state.groups.find(group => group.id === gesture.groupId).tools.length === gesture.tools.length;
        const group = this.moveTools(gesture.tools, {location: 'floating', rect: {...gesture.bounds,
          width: Math.max(180, gesture.bounds.width), height: Math.max(120, gesture.bounds.height)}}, entire ? gesture.groupId : undefined);
        gesture.groupId = group.id; this.render(); this.groupNodes.get(group.id).classList.add('dragging'); this.showTargets();
      }
    }
    const group = this.state.groups.find(group => group.id === gesture.groupId);
    if (gesture.kind === 'move') {
      group.rect.x = Math.max(0, Math.min(this.root.clientWidth - Math.min(this.root.clientWidth, group.rect.width), gesture.bounds.x + dx));
      group.rect.y = Math.max(0, Math.min(this.root.clientHeight - Math.min(this.root.clientHeight, group.rect.height), gesture.bounds.y + dy));
      this.dropTarget = this.dropTargets.find(target => { const rect = target.node.getBoundingClientRect(); return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom; });
      for (const target of this.dropTargets) target.node.classList.toggle('selected', target === this.dropTarget);
    } else if (gesture.side) {
      const horizontal = ['left', 'right'].includes(gesture.side), origin = horizontal ? gesture.bounds.width : gesture.bounds.height;
      this.state.sizes[gesture.side] = Math.max(100, Math.min(4000, origin + (horizontal ? dx : dy) * (['right', 'bottom'].includes(gesture.side) ? -1 : 1)));
    } else {
      group.rect.width = Math.max(180, Math.min(4000, gesture.bounds.width + dx));
      group.rect.height = Math.max(120, Math.min(4000, gesture.bounds.height + dy));
    }
    this.applyGeometry();
  }
  showTargets() {
    this.targets.replaceChildren(); this.targets.hidden = false; this.dropTargets = []; this.dropTarget = null;
    const width = this.root.clientWidth, height = this.root.clientHeight, margin = 8;
    const add = (label, destination, rect) => {
      const node = document.createElement('div'); node.className = 'dock-target'; node.textContent = label;
      node.dataset.location = destination.location || destination.groupId;
      Object.assign(node.style, {left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`});
      this.targets.appendChild(node); this.dropTargets.push({node, destination});
    };
    const edgeWidth = Math.min(52, width / 5), edgeHeight = Math.min(120, height / 3);
    add('Left', {location: 'left'}, {x: margin, y: (height - edgeHeight) / 2, width: edgeWidth, height: edgeHeight});
    add('Right', {location: 'right'}, {x: Math.max(0, width - edgeWidth - margin), y: (height - edgeHeight) / 2, width: edgeWidth, height: edgeHeight});
    const topWidth = Math.min(150, width / 3), topHeight = Math.min(36, height / 5);
    add('Top', {location: 'top'}, {x: (width - topWidth) / 2, y: margin, width: topWidth, height: topHeight});
    add('Bottom', {location: 'bottom'}, {x: (width - topWidth) / 2, y: Math.max(0, height - topHeight - margin), width: topWidth, height: topHeight});
    const root = this.root.getBoundingClientRect();
    for (const group of this.state.groups) if (group.id !== this.gesture.groupId) {
      const bounds = this.groupNodes.get(group.id).getBoundingClientRect(), w = Math.min(160, bounds.width);
      add('Join tabs', {groupId: group.id}, {x: bounds.left - root.left + (bounds.width - w) / 2,
        y: bounds.top - root.top, width: w, height: Math.min(56, bounds.height)});
    }
  }
  clearGesture() {
    const pointerId = this.gesture?.pointerId; this.gesture = null;
    this.targets.hidden = true; this.targets.replaceChildren(); this.dropTarget = null;
    this.root.classList.remove('workspace-dragging');
    if (pointerId !== undefined && this.root.hasPointerCapture(pointerId)) this.root.releasePointerCapture(pointerId);
  }
  endGesture(event) {
    const gesture = this.gesture; if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.started && gesture.kind === 'move' && this.dropTarget) this.moveTools(gesture.tools, this.dropTarget.destination);
    this.clearGesture();
    if (gesture.started) {
      this.suppressClick = true; setTimeout(() => { this.suppressClick = false; }, 0); this.commit();
    }
  }
  cancelGesture() {
    if (!this.gesture) return;
    const original = this.gesture.original; this.clearGesture(); this.state = original; this.commit();
  }
  destroy() {
    this.cancelGesture(); this.observer.disconnect();
    this.root.removeEventListener('pointerdown', this.pointerDown);
    this.root.removeEventListener('lostpointercapture', this.pointerCancel);
    document.removeEventListener('pointermove', this.pointerMove);
    document.removeEventListener('pointerup', this.pointerUp);
    document.removeEventListener('pointercancel', this.pointerCancel);
    document.removeEventListener('keydown', this.keyDown, true);
  }
}
globalThis.ViperDesignerWorkspace = ViperDesignerWorkspace;
