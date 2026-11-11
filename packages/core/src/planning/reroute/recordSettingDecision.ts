import type { RerouteProposal } from '../../model/reroute';
import { recordDecision } from '../operations/decisionOps';
import type { RerouteEnv } from './rerouteFlow';
import { settingAsk } from './settingText';

/**
 * The trail lead approved a request to change one of their settings: kept as their decision, with what was asked as
 * it was shown, and where they approved it (the Lookout or Slack), so the trail's Logbook says who changed it.
 */
export async function recordSettingDecision(env: RerouteEnv, p: RerouteProposal, by: string) {
  const via = by.startsWith('slack:') ? 'slack' : 'lookout';
  const ask = settingAsk(p);
  return recordDecision(env.adapter, p.mapId, {
    question: `${ask}. Why: ${p.reason}`,
    answer: `Approved (${p.id}).`,
    summary: `${ask.replace(/ asks to /, ': ')}, approved`,
    rationale: `${p.reason}\n\nEvidence: ${p.evidence}`,
    decidedBy: by,
    participants: [{ id: p.by }, { id: by }],
    source: { kind: via, ref: `reroute:${p.mapId}/${p.id}`, label: via === 'slack' ? 'Slack' : 'Lookout' },
  });
}
