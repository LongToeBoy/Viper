/* The same value snapshots and property updates serve Preview and Run. */
class ViperControlSession {
  constructor(form, nodes, request, onError = error => console.error(error)) {
    this.form = form; this.nodes = nodes; this.request = request; this.onError = onError;
    this.pending = Promise.resolve(); this.revisions = new Map(); this.listeners = new Map(); this.disposed = false;
    for (const [id, node] of nodes) {
      const listener = () => this.revisions.set(id, (this.revisions.get(id) || 0) + 1);
      node.addEventListener('input', listener); this.listeners.set(node, listener);
    }
  }
  values() {
    const values = {};
    for (const component of this.form.components) {
      const node = this.nodes.get(component.id); if (!node) continue;
      if (component.type === 'text_input') values[component.id] = {text: node.value};
      else if (component.type === 'checkbox') values[component.id] = {checked: node.querySelector('input').checked};
    }
    return values;
  }
  dispatch(payload) {
    this.pending = this.pending.then(async () => {
      if (this.disposed) return;
      // Read after earlier responses apply, so rapid clicks see earlier writes.
      const values = this.values(), revisions = new Map(this.revisions);
      const result = await this.request({...payload, window_id: this.form.form_id, values});
      if (this.disposed) return;
      for (const update of result?.updates || []) {
        if (update.window_id !== this.form.form_id) continue;
        const component = this.form.components.find(component => component.id === update.component_id);
        const node = this.nodes.get(update.component_id); if (!component || !node) continue;
        const properties = {...update.properties};
        const key = component.type === 'text_input' ? 'text' : component.type === 'checkbox' ? 'checked' : null;
        if (key && Object.hasOwn(properties, key)) {
          const current = component.type === 'text_input' ? node.value : node.querySelector('input').checked;
          if ((this.revisions.get(component.id) || 0) !== (revisions.get(component.id) || 0) || current !== values[component.id][key]) delete properties[key];
        }
        viperComponents.apply(node, component, properties);
      }
      return result;
    }).catch(error => { if (!this.disposed) this.onError(error); });
    return this.pending;
  }
  dispose() {
    this.disposed = true;
    for (const [node, listener] of this.listeners) node.removeEventListener('input', listener);
    this.listeners.clear();
  }
}
globalThis.ViperControlSession = ViperControlSession;
