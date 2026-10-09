/* Shared event-driven renderer for hard anchor relationships. */
class ViperRelativeLayout {
  constructor(canvas, onChange = () => {}, onError = error => console.error(error)) {
    this.canvas = canvas; this.onChange = onChange; this.onError = onError;
    this.rectangles = new Map(); this.nodes = new Map();
    this.observer = new ResizeObserver(() => { if (this.project) this.update(); });
    this.observer.observe(canvas);
  }
  initialize(project) {
    for (const c of project.components) if (!c.box) {
      c.box = {...viperComponents.bounds(c.layout, project.canvas_width, project.canvas_height),
        reference_width: project.canvas_width, reference_height: project.canvas_height};
      c.size_mode = c.size_mode || 'fixed';
    }
  }
  bind(project, nodes) {
    this.project = project; this.nodes = nodes; this.initialize(project); this.update();
  }
  update() {
    if (this.canvas.clientWidth <= 0 || this.canvas.clientHeight <= 0) return;
    try {
      this.rectangles = ViperAnchorLayout.solve(this.project, this.canvas.clientWidth, this.canvas.clientHeight);
      for (const [id, node] of this.nodes) {
        const rectangle = this.rectangles.get(id); if (!rectangle) continue;
        Object.assign(node.style, {left: '0px', top: '0px', width: `${rectangle.width}px`,
          height: `${rectangle.height}px`, transform: `translate(${rectangle.x}px, ${rectangle.y}px)`});
      }
      this.onChange();
    } catch (error) { this.onError(error); }
  }
  anchor(endpoint) { return ViperAnchorLayout.anchor(this.rectangles.get(endpoint.body), endpoint.edge); }
  move(id, rectangle) {
    const component = this.project.components.find(c => c.id === id);
    const before = component.box;
    const previousLinks = this.project.links.map(link => ({...link}));
    component.box = {...rectangle, reference_width: this.canvas.clientWidth, reference_height: this.canvas.clientHeight};
    // An intentional edit updates scalar offsets of incoming links. Followers
    // retain their relationships and immediately follow the edited reference.
    for (const link of this.project.links.filter(l => l.b.body === id)) {
      const a = this.anchor(link.a), b = ViperAnchorLayout.anchor(rectangle, link.b.edge);
      if (link.axis !== 'y') link.distance_x = (b.x - a.x) / this.canvas.clientWidth;
      if (link.axis !== 'x') link.distance_y = (b.y - a.y) / this.canvas.clientHeight;
    }
    try { ViperAnchorLayout.solve(this.project, this.canvas.clientWidth, this.canvas.clientHeight); }
    catch (error) { component.box = before; this.project.links = previousLinks; throw error; }
    this.update();
  }
  destroy() { this.observer.disconnect(); }
}
globalThis.ViperRelativeLayout = ViperRelativeLayout;
