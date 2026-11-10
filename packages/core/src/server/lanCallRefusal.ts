import { HUMAN_ASSIGNEE, MAP_META_TRUST, TICKET_META_TRUST, TRUST_REFUSED } from './trustFields';

const has = (v: unknown, keys: string[]) =>
  !!v && typeof v === 'object' && keys.some((k) => (v as Record<string, unknown>)[k] !== undefined);

/**
 * Why a device on the network may not make this tracker call (`/tracker/<kind>/call`), or undefined when it
 * may. The same rule as lanFileRefusal.ts, for GitHub and Linear: no trust field set, no ticket handed to the
 * human, and no decision put on record, whatever the method.
 */
export function lanCallRefusal(method: string, args: unknown[]): string | undefined {
  switch (method) {
    case 'setMapMeta':
      return has(args[1], MAP_META_TRUST) ? TRUST_REFUSED : undefined;
    case 'createMap':
      return has(args[0], MAP_META_TRUST) ? TRUST_REFUSED : undefined;
    case 'setMeta':
      return has(args[2], TICKET_META_TRUST) ? TRUST_REFUSED : undefined;
    case 'assign':
      return typeof args[2] === 'string' && HUMAN_ASSIGNEE.test(args[2]) ? TRUST_REFUSED : undefined;
    case 'createDecision':
    case 'markSuperseded':
      return TRUST_REFUSED;
    default:
      return undefined;
  }
}
