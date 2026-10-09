(() => {
  let passed = 0;
  const check = (condition, message) => { if (!condition) throw new Error(message); passed++; };
  const close = (a, b) => Math.abs(a - b) < .00001;
  const component = (id, mode = 'fixed') => ({id, name: id, size_mode: mode,
    layout: {min_width: 10, min_height: 10},
    box: {x: 100, y: 100, width: 100, height: 50, reference_width: 1000, reference_height: 600}});
  const link = (id, a, ae, b, be, x, y, axis = 'both') => ({id, a: {body: a, edge: ae},
    b: {body: b, edge: be}, distance_x: x, distance_y: y, axis});
  const project = {components: [component('a'), component('b')], links: [link('a', '$window', 'left', 'a', 'left', .1, -.25),
    link('b', 'a', 'right', 'b', 'left', .05, 0)]};
  let rects = ViperAnchorLayout.solve(project, 1000, 600);
  check(close(rects.get('a').x, 100) && close(rects.get('b').x, 250), 'Hard offsets and chained link');
  rects = ViperAnchorLayout.solve(project, 2000, 1200);
  check(close(rects.get('a').x, 200) && close(rects.get('b').x, 400), 'Scalars scale with window size while fixed width stays constant');
  check(close(rects.get('a').width, 100) && close(rects.get('b').width, 100), 'Fixed size');
  project.components[0].size_mode = 'stretch';
  rects = ViperAnchorLayout.solve(project, 2000, 1200);
  check(close(rects.get('a').width, 200) && close(rects.get('b').x, 500), 'Stretch size updates follower reference');
  project.links.push(link('right', '$window', 'right', 'a', 'right', -.1, 0, 'x'));
  rects = ViperAnchorLayout.solve(project, 1000, 600);
  check(close(rects.get('a').x, 100) && close(rects.get('a').width, 800), 'Opposing links define stretched bounds');
  rects = ViperAnchorLayout.solve(project, 2000, 600);
  check(close(rects.get('a').width, 1600), 'Opposing scalar margins resize exactly');
  project.components[0].size_mode = 'fixed';
  let rejected = false; try { ViperAnchorLayout.solve(project, 1000, 600); } catch (_) { rejected = true; }
  check(rejected, 'Fixed dimensions must not silently break opposing hard links');
  project.components[0].size_mode = 'stretch';
  project.links.push(link('cycle', 'b', 'right', 'a', 'left', 0, 0));
  rejected = false; try { ViperAnchorLayout.solve(project, 1000, 600); } catch (_) { rejected = true; }
  check(rejected, 'Dependency cycles are rejected');
  const axes = {components: [component('c')], links: [link('x', '$window', 'right', 'c', 'left', -.2, 100, 'x')]};
  rects = ViperAnchorLayout.solve(axes, 1000, 600);
  check(close(rects.get('c').x, 800) && close(rects.get('c').y, 100), 'X-only link leaves Y unconstrained');
  const before = JSON.stringify(axes); ViperAnchorLayout.solve(axes, 500, 300);
  check(JSON.stringify(axes) === before, 'Solver must not mutate saved authoring geometry');
  return {passed};
})()
