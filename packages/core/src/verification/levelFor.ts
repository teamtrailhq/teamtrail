import { listGuides } from '../guides/guideStore';
import { checksOfGuides, resolveGuides } from '../guides/resolveGuides';
import { droppedChecks } from '../mainChecks/withKnownFailures';
import type { MapSnapshot, Ticket } from '../model/types';
import { withApprovedLevel } from './approvedLevel';
import { trustedChecks } from './checksApproval';
import type { ConfigRead } from './configFile';
import { verificationFor, type LevelInfo } from './policy';

/**
 * The level a completion of `t` needs, with the config it was read from. A ticket's guides add the checks they
 * require, the union of them all (resolveGuides.ts); they never change the level or drop a check. A disabled guide
 * keeps adding the checks of its last approved version.
 */
export function levelFor(root: string, snap: MapSnapshot, t: Ticket): { info: LevelInfo; config: ConfigRead } {
  // the approved config and the approved level: an edit to verification.json or to a trail's or ticket's level in
  // the tracker files lowers nothing until the trail lead approves it (approvedLevel.ts)
  const { config } = trustedChecks(root);
  const asked = verificationFor(config.config, snap.map, t);
  const approved = withApprovedLevel(root, { config: config.config, map: snap.map, t, info: asked });
  // checks the trail lead dropped for this trail because they fail on main (mainChecks/chooseMain.ts)
  const dropped = droppedChecks(root, snap.map.id);
  const info = dropped.length ? { ...approved, checks: approved.checks.filter((c) => !dropped.includes(c)) } : approved;
  const guides = resolveGuides(listGuides(root), { map: snap.map, ticket: t });
  if (!guides.length) return { info, config };
  return { info: { ...info, checks: checksOfGuides(info.checks, guides) }, config };
}
