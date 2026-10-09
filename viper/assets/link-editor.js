/* Authoring and direct selection of hard relative anchor links. */
class ViperLinkEditor {
  constructor(canvas, anchors, callbacks) {
    this.canvas = canvas; this.anchors = anchors; this.callbacks = callbacks;
    this.connecting = false; this.pending = null; this.selected = null; this.lines = new Map();
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = `position-anchor container-anchor anchor-${edge}`; button.dataset.anchor = edge;
      button.title = `Window ${edge} anchor`; button.setAttribute('aria-label', button.title);
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.onclick = event => { event.stopPropagation(); this.anchor('$window', edge); };
      anchors.appendChild(button);
    }
    for (const key of ['axis', 'distance_x', 'distance_y']) {
      document.getElementById(`link-${key}`).onchange = event => {
        const link = this.project.links.find(l => l.id === this.selected); if (!link || this.preview) return;
        const value = key === 'axis' ? event.target.value : Number(event.target.value);
        if (key !== 'axis' && !Number.isFinite(value)) return;
        const previous = link[key]; link[key] = value;
        try { ViperAnchorLayout.solve(this.project, this.canvas.clientWidth, this.canvas.clientHeight); }
        catch (error) { link[key] = previous; this.callbacks.status(error.message); this.inspect(); return; }
        this.callbacks.changed();
      };
    }
    document.getElementById('delete-link').onclick = () => {
      if (this.preview) return;
      this.project.links = this.project.links.filter(l => l.id !== this.selected);
      this.selected = null; this.callbacks.changed();
    };
  }
  setConnecting(value) {
    this.connecting = !!value && !this.preview && !!this.project; this.pending = null; this.mode();
    this.callbacks.status(this.connecting ? 'Click a reference anchor, then the element that should follow it' : 'Design mode');
  }
  mode() {
    this.canvas.classList.toggle('connecting-links', this.connecting && !this.preview);
    this.anchors.hidden = this.preview;
    for (const anchor of [...this.canvas.querySelectorAll('.position-anchor'), ...this.anchors.children]) {
      const body = anchor.closest('.component-wrapper')?.dataset.id || '$window';
      anchor.classList.toggle('anchor-pending', !!this.pending && this.pending.body === body && this.pending.edge === anchor.dataset.anchor);
    }
    this.callbacks.modeChanged?.();
  }
  bind(project, layout, preview) {
    if (this.project !== project) { this.pending = null; this.selected = null; }
    this.project = project; this.layout = layout; this.preview = preview;
    if (this.pending && this.pending.body !== '$window' && !project.components.some(c => c.id === this.pending.body)) this.pending = null;
    this.mode(); this.lines.clear();
    const ns = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(ns, 'svg'); this.svg.classList.add('link-overlay');
    this.svg.hidden = preview; this.canvas.appendChild(this.svg);
    for (const link of project.links) {
      const visible = document.createElementNS(ns, 'path'); visible.classList.add('link-line');
      const hit = document.createElementNS(ns, 'path'); hit.classList.add('link-hit'); hit.dataset.linkId = link.id;
      hit.setAttribute('tabindex', '0'); hit.setAttribute('aria-label', 'Select relative layout link');
      hit.addEventListener('pointerdown', event => event.stopPropagation());
      const select = event => {
        event.preventDefault(); event.stopPropagation(); this.selected = link.id; this.inspect(); this.draw();
        document.getElementById('link-properties').scrollIntoView({block: 'nearest'});
      };
      hit.onclick = select; hit.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') select(event); };
      this.svg.append(visible, hit); this.lines.set(link.id, {visible, hit});
    }
    this.inspect(); this.draw();
  }
  anchor(body, edge) {
    if (!this.connecting || this.preview) return;
    if (!this.pending) { this.pending = {body, edge}; this.mode(); this.callbacks.status('Choose the dependent element anchor'); return; }
    if (this.pending.body === body) { this.callbacks.status('Choose a different element'); return; }
    let a = this.pending, b = {body, edge};
    if (b.body === '$window') [a, b] = [b, a];
    const pa = this.layout.anchor(a), pb = this.layout.anchor(b);
    const link = {id: `link_${Date.now()}_${Math.random().toString(16).slice(2)}`, a, b, axis: 'both',
      distance_x: (pb.x - pa.x) / this.canvas.clientWidth, distance_y: (pb.y - pa.y) / this.canvas.clientHeight};
    const target = this.project.components.find(c => c.id === b.body), previousMode = target.size_mode;
    const factors = {top: [.5, 0], bottom: [.5, 1], left: [0, .5], right: [1, .5]};
    if (this.project.links.some(l => l.b.body === b.body &&
      ((l.axis !== 'y' && factors[l.b.edge][0] !== factors[b.edge][0]) ||
       (l.axis !== 'x' && factors[l.b.edge][1] !== factors[b.edge][1])))) target.size_mode = 'stretch';
    this.project.links.push(link);
    try { ViperAnchorLayout.solve(this.project, this.canvas.clientWidth, this.canvas.clientHeight); }
    catch (error) {
      this.project.links.pop(); target.size_mode = previousMode; this.pending = null; this.mode();
      this.callbacks.status(error.message); return;
    }
    this.selected = link.id; this.pending = null; this.callbacks.changed();
    this.callbacks.status('Linked. Edit X/Y scalars in the inspector; click the line to select it.');
  }
  inspect() {
    const link = this.project.links.find(l => l.id === this.selected);
    const name = endpoint => endpoint.body === '$window' ? 'Window' : this.project.components.find(c => c.id === endpoint.body)?.name;
    document.getElementById('link-selection').textContent = link ? `${name(link.a)}.${link.a.edge} → ${name(link.b)}.${link.b.edge}` : 'Click a link to edit its distances';
    for (const key of ['axis', 'distance_x', 'distance_y']) {
      const input = document.getElementById(`link-${key}`); input.disabled = !link || this.preview;
      if (link) input.value = key === 'axis' ? link[key] : Number(link[key].toFixed(6));
    }
    document.getElementById('delete-link').disabled = !link || this.preview;
  }
  draw() {
    if (!this.project || !this.svg || this.preview || !this.layout.rectangles.has('$window')) return;
    const container = this.layout.rectangles.get('$window');
    this.svg.setAttribute('viewBox', `0 0 ${container.width} ${container.height}`);
    Object.assign(this.anchors.style, {top: `${this.canvas.offsetTop}px`, width: `${container.width}px`, height: `${container.height}px`});
    for (const link of this.project.links) {
      const a = this.layout.anchor(link.a), b = this.layout.anchor(link.b), line = this.lines.get(link.id);
      if (!line) continue;
      const path = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
      line.visible.setAttribute('d', path); line.hit.setAttribute('d', path);
      line.visible.classList.toggle('selected', this.selected === link.id);
    }
  }
}
globalThis.ViperLinkEditor = ViperLinkEditor;
