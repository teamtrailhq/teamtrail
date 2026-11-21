import type { AuditDecision } from '@teamtrail/core';

/** The key a kept decision is remembered under (lib/keptDecisions.ts), the same as the Hands-off home's. */
export const keptKey = (d: Pick<AuditDecision, 'mapId' | 'id'>) => `${d.mapId}/${d.id}`;
