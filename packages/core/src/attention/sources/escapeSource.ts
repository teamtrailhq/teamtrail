import { escapeRule } from '../escapeRule';
import type { AttentionSource, Candidate } from '../types';

/**
 * Verified work that came back (scorecard/findEscapes.ts): the checks passed and it was wrong anyway. The item asks
 * whether a diff rule on the files it changed should catch the next one; it opens the Rules editor prefilled.
 */
export const escapeSource: AttentionSource = {
  kind: 'escape',
  collect({ escapes = [] }) {
    return escapes.map((e): Candidate => {
      const rule = escapeRule(e);
      const passed = e.checks.length ? `passed ${e.checks.join(', ')}` : 'no check ran';
      return {
        kind: 'escape',
        mapId: e.mapId,
        ticketId: e.ticketId,
        title: `${e.ticketKey} was verified, then ${e.kind}: add a rule?`,
        since: e.at,
        urgency: 'soon',
        ref: `${e.ticketId}:${e.attemptId}`,
        agent: e.agent,
        holds: [],
        notes: [e.evidence, passed, ...(rule.when.length ? [`changed ${rule.when.join(', ')}`] : [])],
        ...(rule.when.length ? { rule } : {}),
      };
    });
  },
};
