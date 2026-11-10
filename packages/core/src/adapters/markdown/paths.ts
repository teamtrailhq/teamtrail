/** `<trail>/decisions/<D-n>.md`; groups: trail, decision id. */
export const DECISION_PATH = /^([^/]+)\/decisions\/([^/]+)\.md$/;

/** Folder name of a new trail: its title in kebab case, else `map-<n>`. */
export const trailSlug = (title: string, n: number) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `map-${n}`;

/** A trail, ticket or decision id as a file name: one plain path segment, never `..`, a slash or a hidden file. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/;

/** `id` when it is safe in a tracker path; ids reach here from agents, the bridge and trackers. */
export function segment(id: string): string {
  if (typeof id !== 'string' || id.length > 128 || !SEGMENT.test(id))
    throw new Error(`not a valid id: ${JSON.stringify(id)}`);
  return id;
}

/** `<trail>/tickets/<id>.md`, exactly: a file in a subfolder, or with an id no ticket can have, isn't a ticket. */
export const isTicketFile = (rel: string) => {
  const m = rel.match(/^[^/]+\/tickets\/([^/]+)\.md$/);
  return !!m && SEGMENT.test(m[1]);
};
