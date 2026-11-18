import { apiBase } from './apiBase';

/** When the person was last here before this visit: per trail, and across trails (`any`). */
export interface AwayVisit {
  seen: Record<string, number>;
  any?: number;
}

/** Per project: each has its own trails. */
const key = () => `teamtrail.away-visit${apiBase()}`;

function stored(): AwayVisit | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(key()) ?? 'null') as AwayVisit | null;
    return v && typeof v.seen === 'object' ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The visit "Since you were away" counts from. Coming back after being away (`away`), that time, kept in this browser
 * so a reload a minute later still tells the same story; otherwise the one kept, else `present`, kept from now on.
 */
export function awayVisit(away: AwayVisit | undefined, present: AwayVisit): AwayVisit {
  if (!away) return stored() ?? keep(present);
  return keep(away);
}

function keep(away: AwayVisit) {
  try {
    localStorage.setItem(key(), JSON.stringify(away));
  } catch {
    // storage blocked: this visit still counts from it
  }
  return away;
}
