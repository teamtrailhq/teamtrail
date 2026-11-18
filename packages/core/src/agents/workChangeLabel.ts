import { isTicketFile } from '../adapters/markdown/paths';
import { CRITERIA_DIR } from '../criteria/criteria';
import { BRIEF_DIR } from '../discovery/brief';
import { MAIN_DIR } from '../mainChecks/mainRunStore';
import { REROUTES_DIR } from '../planning/reroute/rerouteStore';

/** Project files whose change can let work be claimed: settings the trail lead keeps in the tracker folder. */
const SETTINGS: Record<string, string> = {
  'attention.json': 'the review limit changed',
  'policy.json': 'the risk policy changed',
  'verification.json': 'the check commands changed',
  'workspaces.json': 'the workspace setting changed',
  'models.json': 'the models changed',
};

/** A change in the checks on main: the run record and what is latest, never the logs a run streams. */
const mainRun = (rel: string) =>
  rel === `${MAIN_DIR}/latest.json` ||
  rel === `${MAIN_DIR}/running.json` ||
  new RegExp(`^${MAIN_DIR}/runs/[^/]+\\.json$`).test(rel);

/** Temp files of atomic writes and the `.gitignore` a local folder gets: never a change of their own. */
const noise = (rel: string) => /\.tmp[^/]*$|\.lock$|(^|\/)\.gitignore$|~$/.test(rel);

/**
 * What a change in the tracker folder (`rel`, `/`-separated) can mean for an agent waiting for work, in a few
 * words; undefined for what never makes work claimable, so a waiting agent isn't woken by it: session docs,
 * leases and names (`.agents/`), the journal, check logs, snoozes, the offline outbox.
 */
export function workChangeLabel(rel: string): string | undefined {
  if (!rel || noise(rel)) return undefined;
  if (rel.startsWith('.evidence/')) return mainRun(rel) ? 'checks on main changed' : undefined;
  if (rel.startsWith(`${CRITERIA_DIR}/`)) return 'acceptance criteria changed';
  if (rel.startsWith(`${BRIEF_DIR}/`)) return 'the discovery brief changed';
  if (rel.startsWith(`${REROUTES_DIR}/`)) return 'a reroute changed';
  if (rel.startsWith('.')) return undefined;
  if (SETTINGS[rel]) return SETTINGS[rel];
  if (isTicketFile(rel)) return 'a ticket changed';
  if (/^[^/]+\/map\.md$/.test(rel)) return 'the trail changed';
  if (/^[^/]+\/decisions\//.test(rel)) return 'a decision was recorded';
  return undefined;
}
