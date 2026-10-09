/* Shared command state for menus, tools, context menus and shortcuts. */
class ViperActionRegistry {
  constructor(onError = error => console.error(error)) {
    this.actions = new Map(); this.listeners = new Set(); this.onError = onError;
  }
  register(action) {
    if (!action.id || !action.name || this.actions.has(action.id)) throw new Error('Action IDs must be unique');
    this.actions.set(action.id, {icon: '', shortcut: '', enabled: true, checked: null,
      callback: () => {}, ...action});
    return this;
  }
  state(id) {
    const action = this.actions.get(id);
    if (!action) throw new Error(`Unknown action: ${id}`);
    const value = key => typeof action[key] === 'function' ? action[key]() : action[key];
    return {...action, enabled: !!value('enabled'), checked: value('checked')};
  }
  execute(id) {
    const action = this.state(id);
    if (!action.enabled) return false;
    try {
      Promise.resolve(action.callback()).catch(this.onError);
    } catch (error) { this.onError(error); }
    this.refresh(); return true;
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  refresh() { for (const listener of this.listeners) listener(); }
  handleKey(event) {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.metaKey) return;
    const editing = event.target?.isContentEditable || event.target?.closest?.('input, textarea, select');
    for (const action of this.actions.values()) {
      if (!action.shortcut || (editing && !action.allowInInput)) continue;
      const parts = action.shortcut.toLowerCase().split('+');
      if (event.ctrlKey !== parts.includes('ctrl') || event.shiftKey !== parts.includes('shift')) continue;
      if (event.key.toLowerCase() !== parts[parts.length - 1]) continue;
      if (this.state(action.id).enabled) { event.preventDefault(); return this.execute(action.id); }
      return;
    }
  }
}
globalThis.ViperActionRegistry = ViperActionRegistry;
