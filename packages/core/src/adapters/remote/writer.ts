import { oneLine } from '../../model/safeText';

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

/**
 * An actor id from a teammate's author marker, as shown here: always under their tracker name. Their human is
 * `mona`; anything else they name (an agent, or a made-up "Trail Lead") is `claude-09 (mona)`.
 */
export const teammateActor = (id: string, name: string) =>
  id.trim().toLowerCase() === TRAIL_LEAD ? name : `${oneLine(id)} (${name})`;
