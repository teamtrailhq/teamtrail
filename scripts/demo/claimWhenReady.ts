import type { Call } from './demoChart';
import { beat } from './pace';

/** Claims a ticket by key once Teamtrail lets it: after the plan is approved, checks on main ran and blockers closed. */
export async function claimWhenReady(o: { call: Call; key: string; who: string }) {
  let told = '';
  for (;;) {
    try {
      const r = await o.call('claim_ticket', { trail: '#1', ticket: o.key });
      // The ticket's acceptance criteria come beside it in the claim, not on it.
      return { ...r.claimed, criteria: r.criteria?.list ?? [] };
    } catch (e) {
      const why = (e as Error).message.replace(/^claim_ticket: /, '').split('\n')[0];
      if (why !== told) console.log(`${o.who} · waiting for ${o.key}: ${why}`);
      told = why;
      await beat(3);
    }
  }
}
