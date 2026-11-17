import type { WaivedCheck } from '../model/checkWaiver';
import type { VerificationLevel } from '../model/lifecycle';
import { submittedFields } from './submittedFields';

type Submitted = Parameters<typeof submittedFields>[0] & {
  agent: string;
  sessionId?: string;
  origin?: string;
  resolution: string;
};

/** What an attempt records before its checks run: the ticket, who submitted what, the level, the waived checks. */
export function attemptBase(o: {
  job: { mapId: string; ticket: { id: string; key: string }; info: { level: VerificationLevel }; sub: Submitted };
  configHash?: string;
  runner?: string;
  waived: WaivedCheck[];
}) {
  const { mapId, ticket: t, info, sub } = o.job;
  return {
    v: 1 as const,
    mapId,
    ticketId: t.id,
    ticketKey: t.key,
    agent: sub.agent,
    ...(sub.sessionId ? { sessionId: sub.sessionId } : {}),
    ...(sub.origin ? { origin: sub.origin } : {}),
    level: info.level,
    configHash: o.configHash ?? 'none',
    submittedAt: Date.now(),
    resolution: sub.resolution,
    ...submittedFields(sub, o.runner),
    ...(o.waived.length ? { waived: o.waived } : {}),
  };
}
