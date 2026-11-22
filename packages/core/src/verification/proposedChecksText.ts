import { checkArgv } from '../guides/checkArgv';

/** One check a setup ticket's agent proposes: a name, its argv and the folder it runs in. */
export interface ProposedSetupCheck {
  name: string;
  run: string[];
  cwd?: string;
}

/** At most this many checks in one file (verification/setChecks.ts). */
const MAX_PROPOSED_CHECKS = 10;
const MAX_ARGS = 32;
const MAX_ARG = 500;
const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Characters an argv element never holds: a line break or NUL would change how it reads in the approval. */
const UNSAFE = /[\r\n\0]/;

function problemOf(c: ProposedSetupCheck): string | undefined {
  if (!NAME.test(c.name)) return `${c.name}: a check's name is lowercase letters, digits and dashes, up to 40`;
  if (!c.run.length || c.run.length > MAX_ARGS) return `${c.name}: give its argv, 1 to ${MAX_ARGS} parts`;
  if (c.run.some((a) => !a || a.length > MAX_ARG || UNSAFE.test(a)))
    return `${c.name}: each argv part is one line, 1 to ${MAX_ARG} characters`;
  if (c.cwd !== undefined && (!c.cwd || c.cwd.length > 300 || UNSAFE.test(c.cwd)))
    return `${c.name}: cwd is one repo-relative folder`;
  const refused = checkArgv({ run: c.run, ...(c.cwd ? { cwd: c.cwd } : {}) });
  return refused.length ? `${c.name}: ${refused.join('; ')}` : undefined;
}

/** The current file as a JSON object to keep its other settings, else a fresh one. */
function base(current: string | undefined): Record<string, unknown> {
  try {
    const v: unknown = current ? JSON.parse(current) : undefined;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // a file that doesn't parse is replaced: the approval shows the whole change
  }
  return { v: 1 };
}

/**
 * verification.json with a setup ticket's proposed checks (model/setupTicket.ts): `checks` and `run` replaced by
 * them, every other setting kept as the file has it. Refused when a check's argv carries or downloads code (the check
 * lint), a name repeats, or a part could read differently in the approval. Only a proposal: nothing in it runs until
 * the trail lead approves the file on this machine (checksApproval.ts).
 */
export function proposedChecksText(o: {
  current?: string;
  checks: ProposedSetupCheck[];
}): { text: string } | { refused: string } {
  if (!o.checks.length || o.checks.length > MAX_PROPOSED_CHECKS)
    return { refused: `Propose 1 to ${MAX_PROPOSED_CHECKS} checks` };
  const names = new Set<string>();
  for (const c of o.checks) {
    const problem = problemOf(c);
    if (problem) return { refused: problem };
    if (names.has(c.name)) return { refused: `${c.name} is named twice` };
    names.add(c.name);
  }
  const checks = Object.fromEntries(o.checks.map((c) => [c.name, { run: c.run, ...(c.cwd ? { cwd: c.cwd } : {}) }]));
  const file = { ...base(o.current), checks, run: o.checks.map((c) => c.name) };
  return { text: `${JSON.stringify(file, null, 2)}\n` };
}
