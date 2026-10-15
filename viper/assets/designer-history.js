/* Project snapshots only: editor workspace and Preview sessions are not history. */
class ViperProjectHistory {
  constructor(limit = 50, budget = 16 * 1024 * 1024) {
    this.limit = limit; this.budget = budget; this.reset(null);
  }
  reset(project) {
    this.present = project ? JSON.stringify(project) : null;
    this.past = []; this.future = []; this.group = null; this.time = 0;
  }
  record(project, group = null) {
    const next = JSON.stringify(project);
    if (this.present === next) return false;
    if (this.present === null) { this.reset(project); return false; }
    const now = Date.now();
    if (!group || group !== this.group || now - this.time > 900 || this.future.length || !this.past.length)
      this.past.push(this.present);
    this.present = next; this.future = []; this.group = group; this.time = now;
    let cost = this.present.length + this.past.reduce((total, item) => total + item.length, 0);
    while (this.past.length > this.limit || (this.past.length > 1 && cost > this.budget)) cost -= this.past.shift().length;
    return true;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  step(redo = false) {
    const from = redo ? this.future : this.past, to = redo ? this.past : this.future;
    if (!from.length) return null;
    to.push(this.present); this.present = from.pop(); this.group = null; this.time = 0;
    return JSON.parse(this.present);
  }
}
globalThis.ViperProjectHistory = ViperProjectHistory;
