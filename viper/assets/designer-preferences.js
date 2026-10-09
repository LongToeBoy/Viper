/* Editor preferences are independent of portable application definitions. */
class ViperDesignerPreferences {
  constructor(storage) {
    this.storage = storage; this.key = 'viper.designer.preferences.v1';
    this.values = {showGrid: true, showAnchors: true, snapGrid: false, snapElements: false,
      properties: true, gridSize: 8};
    try {
      const saved = JSON.parse(storage.getItem(this.key) || '{}');
      for (const key of Object.keys(this.values)) {
        if (typeof this.values[key] === 'boolean' && typeof saved[key] === 'boolean') this.values[key] = saved[key];
      }
      if (Number.isInteger(saved.gridSize) && saved.gridSize >= 2 && saved.gridSize <= 128) this.values.gridSize = saved.gridSize;
    } catch (_) { /* Storage can be unavailable in embedded views. */ }
  }
  set(key, value) {
    if (!(key in this.values)) throw new Error(`Unknown editor preference: ${key}`);
    if (key === 'gridSize' ? !Number.isInteger(value) || value < 2 || value > 128 : typeof value !== 'boolean') {
      throw new Error(`Invalid editor preference: ${key}`);
    }
    this.values[key] = value;
    try { this.storage.setItem(this.key, JSON.stringify(this.values)); } catch (_) { /* Session state still works. */ }
  }
  snap(id, bounds, rectangles, width, height, scale) {
    const result = {...bounds}, settings = this.values;
    for (const [axis, size, limit] of [['x', 'width', width], ['y', 'height', height]]) {
      if (settings.snapGrid) result[axis] = Math.round(result[axis] / settings.gridSize) * settings.gridSize;
      if (settings.snapElements) {
        const offsets = [0, result[size] / 2, result[size]], targets = [0, limit / 2, limit];
        for (const [otherId, rect] of rectangles) {
          if (otherId !== id && otherId !== '$window') targets.push(rect[axis], rect[axis] + rect[size] / 2, rect[axis] + rect[size]);
        }
        let delta = null;
        for (const offset of offsets) for (const target of targets) {
          const distance = target - result[axis] - offset;
          if (Math.abs(distance) <= 6 / Math.max(.05, scale) && (delta === null || Math.abs(distance) < Math.abs(delta))) delta = distance;
        }
        if (delta !== null) result[axis] += delta;
      }
      result[axis] = Math.max(0, Math.min(Math.max(0, limit - result[size]), result[axis]));
    }
    return result;
  }
}
globalThis.ViperDesignerPreferences = ViperDesignerPreferences;
