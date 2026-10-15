(async () => {
  const original = clone(projectRoot), originalRequest = viperHost.request;
  let passed = 0;
  const assert = (condition, message) => { if (!condition) throw new Error(message); passed++; };
  try {
    if (preview) togglePreview();
    assert(actions.state('build').enabled, 'Build is available for a project with windows');
    assert(menus.definitions.filter(menu => menu.items.includes('build')).length === 2,
      'File and Run share the same build command');
    let resolveStatus, requests = [];
    viperHost.request = async (command, payload) => {
      requests.push({command, payload});
      if (command === 'build') return {job_id: 'test-job'};
      if (command === 'build-status') return new Promise(resolve => { resolveStatus = resolve; });
      return {};
    };
    actions.execute('build');
    for (let i = 0; i < 20 && !resolveStatus; i++) await new Promise(resolve => setTimeout(resolve, 0));
    assert(building && !actions.state('build').enabled && !actions.execute('build'), 'A second build cannot start while one is in progress');
    assert(requests.slice(0, 2).map(request => request.command).join(',') === 'update,build', 'Build synchronizes the project before opening the destination picker');
    assert(requests[0].payload.project.startup_window_id === original.startup_window_id, 'Build preserves the configured startup window');
    resolveStatus({state: 'complete', path: 'Shared App.zip'}); await buildTask;
    assert(!building && actions.state('build').enabled && status.textContent === 'Build complete', 'Successful builds show Build complete and restore the action');
    viperHost.request = async command => command === 'build' ? {cancelled: true} : {};
    actions.execute('build'); await buildTask;
    assert(status.textContent === 'Build cancelled' && !building, 'Cancelling the destination picker leaves the designer usable');
    viperHost.request = async command => command === 'build' ? {job_id: 'failed'} :
      command === 'build-status' ? {state: 'failed', message: 'Example build failure'} : {};
    actions.execute('build'); await buildTask;
    assert(status.textContent.includes('Example build failure') && actions.state('build').enabled, 'Failed builds report the error and allow retry');
    preview = true; actions.refresh();
    assert(!actions.state('build').enabled, 'Build uses authored definitions outside Preview');
    preview = false;
    replaceProject({...clone(original), windows: [], startup_window_id: null});
    assert(!actions.state('build').enabled, 'An empty project cannot be built');
    return {passed};
  } catch (error) { return {passed, error: error.stack || error.message}; }
  finally { viperHost.request = originalRequest; replaceProject(original); await sync(); }
})()
