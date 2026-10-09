/* Hard relative layout solver. Pure data in, rectangle positions out. No DOM. */
(() => {
  const factors = {left: [0, .5], right: [1, .5], top: [.5, 0], bottom: [.5, 1]};
  class AnchorLayout {
    static anchor(rectangle, edge) {
      const f = factors[edge];
      if (!f || !rectangle) throw new Error('Unknown anchor');
      return {x: rectangle.x + f[0] * rectangle.width, y: rectangle.y + f[1] * rectangle.height};
    }
    static solve(project, width, height) {
      if (!(width > 0 && height > 0)) return new Map();
      const components = new Map(project.components.map(c => [c.id, c]));
      const incoming = new Map(project.components.map(c => [c.id, []]));
      const followers = new Map(project.components.map(c => [c.id, new Set()]));
      const degree = new Map(project.components.map(c => [c.id, 0]));
      for (const link of project.links || []) {
        if (!incoming.has(link.b.body) || (link.a.body !== '$window' && !components.has(link.a.body))) throw new Error('Link references a missing element');
        incoming.get(link.b.body).push(link);
        if (link.a.body !== '$window' && !followers.get(link.a.body).has(link.b.body)) {
          followers.get(link.a.body).add(link.b.body); degree.set(link.b.body, degree.get(link.b.body) + 1);
        }
      }
      const queue = project.components.filter(c => degree.get(c.id) === 0).map(c => c.id);
      const rectangles = new Map([['$window', {x: 0, y: 0, width, height}]]);
      for (let index = 0; index < queue.length; index++) {
        const id = queue[index], component = components.get(id), box = component.box;
        const rx = width / box.reference_width, ry = height / box.reference_height;
        const rectangle = {x: box.x * rx, y: box.y * ry,
          width: component.size_mode === 'stretch' ? box.width * rx : box.width,
          height: component.size_mode === 'stretch' ? box.height * ry : box.height};
        for (const [axis, size, parentSize] of [['x', 'width', width], ['y', 'height', height]]) {
          const equations = new Map();
          for (const link of incoming.get(id)) {
            if (link.axis !== 'both' && link.axis !== axis) continue;
            const coefficient = factors[link.b.edge][axis === 'x' ? 0 : 1];
            const reference = AnchorLayout.anchor(rectangles.get(link.a.body), link.a.edge);
            const target = reference[axis] + link[`distance_${axis}`] * parentSize;
            if (equations.has(coefficient) && Math.abs(equations.get(coefficient) - target) > .01) throw new Error(`Conflicting ${axis} links on ${component.name}`);
            equations.set(coefficient, target);
          }
          const constraints = [...equations];
          if (constraints.length > 1) {
            if (component.size_mode !== 'stretch') throw new Error(`${component.name}: opposing anchors require Stretch size`);
            const [f1, t1] = constraints[0], [f2, t2] = constraints[1];
            rectangle[size] = (t2 - t1) / (f2 - f1); rectangle[axis] = t1 - f1 * rectangle[size];
            for (const [factor, target] of constraints) if (Math.abs(rectangle[axis] + factor * rectangle[size] - target) > .01) throw new Error(`Conflicting ${axis} links on ${component.name}`);
          } else if (constraints.length) {
            const [factor, target] = constraints[0]; rectangle[axis] = target - factor * rectangle[size];
          }
          const minimum = component.layout[`min_${size}`];
          if (rectangle[size] < minimum - .01 && constraints.length > 1) throw new Error(`${component.name}: linked ${size} is smaller than its minimum`);
          if (rectangle[size] < minimum) {
            rectangle[size] = minimum;
            if (constraints.length === 1) rectangle[axis] = constraints[0][1] - constraints[0][0] * minimum;
          }
        }
        rectangles.set(id, rectangle);
        for (const follower of followers.get(id)) {
          degree.set(follower, degree.get(follower) - 1); if (degree.get(follower) === 0) queue.push(follower);
        }
      }
      if (queue.length !== project.components.length) throw new Error('Anchor links cannot form a cycle');
      return rectangles;
    }
  }
  globalThis.ViperAnchorLayout = AnchorLayout;
})();
