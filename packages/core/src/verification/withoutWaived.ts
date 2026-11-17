import type { WaivedCheck } from '../model/checkWaiver';
import type { VerificationConfig } from '../model/verification';
import { activeWaivers } from './activeWaivers';

const sameArgv = (a: string[], b?: string[]) => !!b && a.length === b.length && a.every((x, i) => x === b[i]);

interface Job {
  mapId: string;
  ticket: { id: string };
  info: { checks: string[] };
}

/**
 * A completion's job without the checks the trail lead waived for its ticket, and those checks, for the attempt to
 * keep. A waiver covers a check only while it runs the command it ran when they waived it: a changed command runs
 * again. `waived` on the job names them, so criteria they evidence count as the agent's word (criteria.ts).
 */
export function withoutWaived<J extends Job>(
  root: string,
  job: J,
  config: VerificationConfig | undefined,
): { job: J & { waived: string[] }; waived: WaivedCheck[] } {
  const names = job.info.checks;
  const waived: WaivedCheck[] = [];
  for (const w of activeWaivers(root, job.mapId, job.ticket.id))
    for (const c of w.checks) {
      if (!names.includes(c.name) || waived.some((x) => x.name === c.name)) continue;
      if (!sameArgv(c.argv, config?.checks[c.name]?.run)) continue;
      waived.push({ name: c.name, argv: c.argv, by: w.by, reason: w.reason, at: w.at, waiver: w.id });
    }
  const skip = new Set(waived.map((w) => w.name));
  const info = { ...job.info, checks: names.filter((n) => !skip.has(n)) };
  return { job: { ...job, info, waived: [...skip] }, waived };
}
