const canvas = document.getElementById('canvas');
let project;
const relativeLayout = new ViperRelativeLayout(canvas);
function render() {
  canvas.style.background = project.window.background_color;
  canvas.replaceChildren();
  const nodes = new Map();
  for (const component of project.components) {
    const el = viperComponents.make(component, true, payload => {
      viperHost.request('event', {...payload, window_id: project.form_id || 'main'}).catch(error => alert(error.message));
    });
    canvas.appendChild(el);
    nodes.set(component.id, el);
  }
  relativeLayout.bind(project, nodes);
}
viperHost.request('bootstrap').then(data => { project = data.project; render(); })
  .catch(error => { canvas.textContent = error.message; });
