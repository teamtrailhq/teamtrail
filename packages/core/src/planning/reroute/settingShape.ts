import type { RerouteChange, RerouteOp, RerouteProposal } from '../../model/reroute';

/** The changes a request in the `setting` lane may carry: one of the trail lead's settings. */
export const SETTING_OPS: RerouteOp[] = ['skip_discovery', 'set_mode', 'update_destination'];

/** Ops only a setting request may carry. */
const SETTING_ONLY: RerouteOp[] = ['skip_discovery', 'set_mode'];

/**
 * Why a proposal's lane and changes don't fit together, or undefined. A setting request is exactly one setting
 * change, so what the trail lead is shown (one line in the Lookout, one Slack card) is all that approving applies;
 * a setting change never rides along in a plan proposal or a rule-out.
 */
export function settingShapeError(p: { lane?: RerouteProposal['lane']; changes: RerouteChange[] }): string | undefined {
  if (p.lane === 'setting') {
    if (p.changes.length !== 1 || !SETTING_OPS.includes(p.changes[0].op))
      return 'a setting request is exactly one change: skip_discovery, set_mode or update_destination';
    return undefined;
  }
  const stray = p.changes.find((c) => SETTING_ONLY.includes(c.op));
  return stray ? `${stray.op} is the trail lead's setting: only a setting request may carry it` : undefined;
}
