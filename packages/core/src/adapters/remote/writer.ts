/*
 * Who wrote a comment or an issue body, as far as its Teamtrail markers go. A tracker shows every comment and
 * body to everyone it lets in, so a marker alone says nothing: what counts is the account that posted it.
 *   self      the account this machine writes as (the token's own): its markers are Teamtrail's
 *   teammate  someone else the tracker says belongs to the repo or workspace, most likely running Teamtrail with
 *             their own token: their markers are honoured as theirs, under their name
 *   outsider  anyone else (a passer-by on a public repo, an integration): their markers are text
 */
export interface Writer {
  kind: 'self' | 'teammate' | 'outsider';
  /** Their name in the tracker (a GitHub login, a Linear display name); empty when the tracker doesn't say. */
  name: string;
}

/** What this machine calls its own human; another account's is shown under that account's name instead. */
const TRAIL_LEAD = 'trail lead';

/** An actor id from a teammate's marker, as shown here: their human is `mona`, their agent `claude-09 (mona)`. */
export const teammateActor = (id: string, name: string) => (id.trim() === TRAIL_LEAD ? name : `${id} (${name})`);

/** The same for a decision's people: only "trail lead" is renamed, so agent names stay comparable. */
export const teammatePerson = (id: string, name: string) => (id.trim() === TRAIL_LEAD ? name : id);
