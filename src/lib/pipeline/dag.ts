/**
 * The model graph: each model id (`schema.name`) maps to the model ids it reads. References
 * to anything that is not a key (bronze feeds, unknown names) are ignored here.
 */
export type ModelGraph = ReadonlyMap<string, readonly string[]>;

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function upstream(graph: ModelGraph, id: string): string[] {
  const deps = new Set((graph.get(id) ?? []).filter((dep) => graph.has(dep)));
  return [...deps].sort(compareIds);
}

/**
 * The first cycle a depth-first search finds when it visits models, and each model's
 * references, in `schema.name` code-unit order (runtime contract 2.4). The path starts and
 * ends at the same model, `[a, b, a]` for `a` reading `b` reading `a`; null when acyclic.
 */
export function findCycle(graph: ModelGraph): readonly string[] | null {
  const done = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const visit = (id: string): readonly string[] | null => {
    stack.push(id);
    onStack.add(id);
    for (const dep of upstream(graph, id)) {
      if (onStack.has(dep)) return [...stack.slice(stack.indexOf(dep)), dep];
      if (!done.has(dep)) {
        const cycle = visit(dep);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    onStack.delete(id);
    done.add(id);
    return null;
  };

  for (const id of [...graph.keys()].sort(compareIds)) {
    if (done.has(id)) continue;
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Execution order by Kahn's algorithm, always taking the ready model that sorts first by
 * `schema.name` in code-unit order, so the order is total and reproducible (contract 2.4).
 * Models on or downstream of a cycle never become ready and are left out.
 */
export function topologicalOrder(graph: ModelGraph): readonly string[] {
  const waitingOn = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of graph.keys()) {
    const deps = upstream(graph, id);
    waitingOn.set(id, deps.length);
    for (const dep of deps) dependents.set(dep, [...(dependents.get(dep) ?? []), id]);
  }
  const ready = [...waitingOn].filter(([, count]) => count === 0).map(([id]) => id);
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort(compareIds);
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (waitingOn.get(dependent) ?? 0) - 1;
      waitingOn.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }
  return order;
}
