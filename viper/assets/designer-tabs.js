/* Editor documents are UI state; all forms use the existing designer canvas. */
class ViperDesignerTabs {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.bar = document.getElementById('document-tabs');
    this.editor = document.getElementById('event-editor');
    this.kind = document.getElementById('event-kind');
    this.handler = document.getElementById('event-handler');
    this.source = document.getElementById('event-source');
    this.documents = [];
    this.active = null;
    this.kind.onchange = () => { if (this.active) this.active.event = this.kind.value; this.loadEvent(); };
    this.handler.onchange = () => {
      const context = this.context(); if (!context) return;
      const name = this.handler.value.trim();
      if (name) context.component.event_handlers[this.kind.value] = name;
      else delete context.component.event_handlers[this.kind.value];
      callbacks.changed(); this.loadEvent();
    };
    this.source.addEventListener('input', () => this.saveSource());
    this.source.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      this.source.setRangeText('    ', this.source.selectionStart, this.source.selectionEnd, 'end');
      this.saveSource();
    });
    document.getElementById('create-event-handler').onclick = () => this.createHandler();
    document.getElementById('edit-window-imports').onclick = () => {
      const context = this.context(); if (context) callbacks.imports(context.form.form_id);
    };
    this.bar.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !event.target.matches('[role=tab]')) return;
      event.preventDefault();
      const index = this.documents.findIndex(doc => doc.key === this.active.key), count = this.documents.length;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 :
        (index + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
      this.activate(this.documents[next]);
      this.bar.querySelector('[aria-selected=true]')?.focus();
    });
  }
  forms() {
    const root = this.callbacks.root();
    return root?.windows || [];
  }
  reset() {
    const first = this.forms().find(form => form.form_id === this.callbacks.root()?.startup_window_id);
    this.documents = first ? [{key: `form:${first.form_id}`, formId: first.form_id}] : [];
    this.active = this.documents[0] || null;
  }
  isEvents() { return !!this.active?.componentId; }
  context() {
    const doc = this.active;
    if (!doc?.componentId) return null;
    const form = this.forms().find(form => form.form_id === doc.formId);
    const component = form?.components.find(component => component.id === doc.componentId);
    return component ? {form, component} : null;
  }
  activate(doc) {
    this.active = doc || null;
    this.callbacks.activate(doc?.formId || null);
    if (doc?.componentId) {
      this.loadEvent(true);
      this.source.focus();
    }
  }
  openEvents(formId, componentId) {
    const key = JSON.stringify(['event', formId, componentId]);
    let doc = this.documents.find(doc => doc.key === key);
    if (!doc) { doc = {key, formId, componentId}; this.documents.push(doc); }
    this.activate(doc);
  }
  showForm(formId) {
    if (!this.forms().some(form => form.form_id === formId)) return;
    let doc = this.documents.find(doc => doc.formId === formId && !doc.componentId);
    if (!doc) { doc = {key: `form:${formId}`, formId}; this.documents.push(doc); }
    this.activate(doc);
  }
  close(doc) {
    const index = this.documents.indexOf(doc);
    if (index < 0) return;
    this.documents.splice(index, 1);
    if (this.active === doc) this.activate(this.documents[Math.max(0, index - 1)]);
    else this.render();
  }
  render() {
    const forms = this.forms();
    this.documents = this.documents.filter(doc => forms.some(form => form.form_id === doc.formId &&
      (!doc.componentId || form.components.some(component => component.id === doc.componentId))));
    if (this.active && !this.documents.includes(this.active)) this.active = this.documents[0] || null;
    this.bar.replaceChildren();
    this.documents.forEach((doc, index) => {
      const form = forms.find(form => form.form_id === doc.formId);
      const component = form.components.find(component => component.id === doc.componentId);
      const tab = document.createElement('div'); tab.className = 'document-tab';
      tab.classList.toggle('active', this.active === doc);
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'tab');
      button.id = `document-tab-${index}`;
      button.dataset.document = doc.key;
      button.textContent = component ? `${component.name} · Events` : form.window.name;
      button.title = component ? `${form.window.name} / ${component.name} events` : form.window.title;
      button.setAttribute('aria-selected', String(doc === this.active)); button.tabIndex = doc === this.active ? 0 : -1;
      button.setAttribute('aria-controls', component ? 'event-editor' : 'design-viewport');
      button.onclick = () => this.activate(doc); tab.appendChild(button);
      const close = document.createElement('button'); close.className = 'close-tab'; close.textContent = '×';
      close.setAttribute('aria-label', `Close ${component ? `${component.name} events` : form.window.name}`); close.onclick = () => this.close(doc);
      tab.appendChild(close);
      this.bar.appendChild(tab);
      if (doc === this.active) document.getElementById(component ? 'event-editor' : 'design-viewport').setAttribute('aria-labelledby', button.id);
    });
    this.editor.hidden = !this.isEvents();
    document.getElementById('add-window').disabled = !this.callbacks.root() || this.callbacks.preview();
    document.getElementById('design-viewport').hidden = this.isEvents() || !this.active;
    document.getElementById('document-empty').hidden = !!this.active;
    document.getElementById('workspace').classList.toggle('workspace-events', this.isEvents());
    if (this.isEvents()) this.loadEvent();
  }
  loadEvent(reset = false) {
    const context = this.context(); if (!context) return;
    const {component, form} = context;
    component.event_handlers ||= {};
    document.getElementById('event-heading').textContent = `${form.window.name} / ${component.name} — Events`;
    const current = this.active.event || (['text_input', 'checkbox'].includes(component.type) ? 'change' : 'click');
    const events = [...new Set(['click', 'change', ...Object.keys(component.event_handlers)])];
    this.kind.replaceChildren(...events.map(name => new Option(name, name)));
    this.kind.value = events.includes(current) ? current : events[0];
    this.handler.value = component.event_handlers[this.kind.value] || '';
    this.handler.placeholder = this.suggestName(context);
    const source = this.handler.value ? this.callbacks.root().event_code[this.handler.value] : undefined;
    this.source.value = source ?? '';
    document.getElementById('event-code-status').textContent = source?.trim() ? 'Code is stored in this project.' :
      component.event_handlers[this.kind.value] ? 'No saved code. This event is inactive unless supplied by a registered Python handler.' : 'Create a handler to connect this event.';
  }
  suggestName({component, form}) {
    const stem = `${form.window.name}_${component.name}_${this.kind.value}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const base = `on_${stem}`, root = this.callbacks.root(); let name = base, suffix = 2;
    const used = new Set(this.forms().flatMap(form => form.components.flatMap(c => Object.values(c.event_handlers || {}))));
    while (Object.hasOwn(root.event_code, name) || used.has(name)) name = `${base}_${suffix++}`;
    return name;
  }
  saveSource() {
    const context = this.context(); if (!context) return;
    const name = this.handler.value.trim() || this.handler.placeholder;
    if (!name || (!this.source.value && !context.component.event_handlers[this.kind.value])) return;
    this.handler.value = name;
    context.component.event_handlers[this.kind.value] = name;
    this.callbacks.root().event_code[name] = this.source.value;
    this.callbacks.changed();
    document.getElementById('event-code-status').textContent = 'Code is stored in this project. Save to write the project file.';
  }
  createHandler() {
    const context = this.context(), name = this.handler.value.trim() || this.handler.placeholder; if (!context) return;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      document.getElementById('event-code-status').textContent = 'Use a valid Python function name.'; return;
    }
    const sources = this.callbacks.root().event_code;
    context.component.event_handlers[this.kind.value] = name;
    // Only generate for a missing handler. Existing user source is never replaced.
    if (!Object.hasOwn(sources, name)) sources[name] = `def ${name}(event):\n    pass\n`;
    this.callbacks.changed(); this.loadEvent(); this.source.focus();
  }
}
globalThis.ViperDesignerTabs = ViperDesignerTabs;
