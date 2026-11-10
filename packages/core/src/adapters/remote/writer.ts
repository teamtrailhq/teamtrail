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
  /**
   * How they are shown: always their tracker identity, which no one can set to "trail lead" (`@mona` on GitHub,
   * `Grace (@grace)` on Linear); empty when the tracker doesn't say.
   */
  name: string;
  /** The short identity that qualifies the agents they name: `claude-09 (@mona)`. Defaults to `name`. */
  handle?: string;
  /** Stable and unique in the tracker (a GitHub login, a Linear user id), for ids such as `D-9@mona`. */
  key?: string;
}

/** A GitHub account: `@login`, which is unique and can't hold a space. */
export const githubAccount = (login: string): Pick<Writer, 'name' | 'handle' | 'key'> => ({
  name: `@${login}`,
  handle: `@${login}`,
  key: login,
});

/**
 * A Linear user: their display name, qualified with a handle they can't make look like someone else's (the local
 * part of their email, else their user id): `Grace (@grace)`.
 */
export function linearAccount(u: { id?: string; displayName: string; email?: string | null }) {
  const local = u.email?.split('@')[0]?.replace(/[^A-Za-z0-9._+-]/g, '');
  const handle = local ? `@${local}` : `@user-${(u.id ?? 'unknown').slice(0, 8)}`;
  return { name: `${oneLine(u.displayName)} (${handle})`, handle, key: u.id ?? handle };
}

/** What this machine calls its own human; another account's is shown under that account's name instead. */
const TRAIL_LEAD = 'trail lead';

/**
 * An actor id from a teammate's author marker, as shown here: always under their tracker identity. Their human is
 * `@mona`; anything else they name (an agent, or a made-up "Trail Lead") is `claude-09 (@mona)`.
 */
export const teammateActor = (id: string, w: Writer) =>
  id.trim().toLowerCase() === TRAIL_LEAD ? w.name : `${oneLine(id)} (${w.handle ?? w.name})`;
