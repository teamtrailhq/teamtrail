/**
 * The attention item checks failing on main raise for a trail: its id (as `buildAttention` makes it), its title, and
 * the query that opens it in the Lookout (`?item=`). The agent that is held is told to send the human there.
 */
export function mainChecksItem(o: { mapId: string; runId: string; failing: string[] }) {
  const verb = o.failing.length === 1 ? 'fails' : 'fail';
  const named = `${o.failing.join(', ')} already ${verb} on main`;
  const id = `main-checks:${o.mapId}:${o.runId}`;
  return { id, named, title: `${named}: choose how this trail goes on`, link: `?item=${encodeURIComponent(id)}` };
}
