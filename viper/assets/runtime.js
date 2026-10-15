const canvas = document.getElementById('canvas');
let project;
let controlSession;
const relativeLayout = new ViperRelativeLayout(canvas);
function render() {
  controlSession?.dispose();
  canvas.style.background = project.window.background_color;
  canvas.replaceChildren();
  const nodes = new Map();
  for (const component of project.components) {
    const el = viperComponents.make(component, true, payload => {
      controlSession.dispatch(payload);
    });
    canvas.appendChild(el);
    nodes.set(component.id, el);
  }
  relativeLayout.bind(project, nodes);
  controlSession = new ViperControlSession(project, nodes, payload => viperHost.request('event', payload), error => alert(error.message));
}
viperHost.request('bootstrap').then(data => { project = data.project; render(); })
  .catch(error => { canvas.textContent = error.message; });
