const canvas = document.getElementById('canvas');
let project;
let theme;
let controlSession;
const surface = new ViperApplicationSurface(canvas);
const relativeLayout = new ViperRelativeLayout(canvas);
function render() {
  controlSession?.dispose();
  canvas.style.background = project.window.background_color;
  const root = surface.prepare(theme);
  surface.background(project.window);
  const nodes = new Map();
  for (const component of project.components) {
    const el = viperComponents.make(component, true, payload => {
      controlSession.dispatch(payload);
    }, surface.themed);
    root.appendChild(el);
    nodes.set(component.id, el);
  }
  relativeLayout.bind(project, nodes);
  controlSession = new ViperControlSession(project, nodes, payload => viperHost.request('event', payload), error => alert(error.message));
}
viperHost.request('bootstrap').then(data => { project = data.project; theme = data.theme; render(); })
  .catch(error => { canvas.textContent = error.message; });
