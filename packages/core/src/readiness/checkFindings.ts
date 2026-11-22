import type { ReadinessCheck, ReadinessFinding } from '../model/readiness';
import { NEW_REPO_FINDING } from '../model/setupTicket';
import { VERIFICATION_FILE } from '../verification/configFile';
import { approvedChecks } from './approvedChecks';
import { isNewRepo } from './newRepo';
import type { ReadinessInput } from './types';

/** At most this many checks in one file (verification/setChecks.ts). */
const MAX_CHECKS = 10;

/** The known suggestions, as a fix would add them: at most as many as the file can still take. */
function knownSuggestions(input: ReadinessInput, room: number): ReadinessCheck[] {
  return input.suggestions
    .filter((s) => s.known)
    .slice(0, room)
    .map((s) => ({ name: s.name, run: s.run, cwd: s.cwd, known: true }));
}

/** A repo with no project yet: its first ticket sets it up and proposes the checks (model/setupTicket.ts). */
function newRepoFinding(): ReadinessFinding {
  return {
    id: NEW_REPO_FINDING,
    kind: 'checks',
    level: 'blocks',
    text: 'New repo: the first ticket sets it up',
    why: 'reading the repo found no project to build or test yet',
    howTo: [
      'Start the trail: its agent charts "Set up the project" first and proposes the checks',
      'Approve them in Settings → Approvals; the setup ticket is then checked with them, and the rest of the trail opens',
    ],
  };
}

/** No check runs: either none is approved here, or the approved file names none. */
function noChecks(input: ReadinessInput): ReadinessFinding | undefined {
  if (approvedChecks(input.config).length) return undefined;
  if (input.approval.state === 'first')
    return {
      id: 'checks-unapproved',
      kind: 'checks',
      level: 'blocks',
      text: `Teamtrail can't verify work yet: you haven't approved ${VERIFICATION_FILE}'s checks on this machine`,
      why: `${VERIFICATION_FILE} names check commands nobody approved here`,
      howTo: ['Approve them in Settings → Approvals, or run: teamtrail approve'],
    };
  if (isNewRepo(input)) return newRepoFinding();
  const add = knownSuggestions(input, MAX_CHECKS);
  const n = input.suggestions.length;
  const seen = n ? `reading the repo suggests ${n} check${n === 1 ? '' : 's'}` : 'nothing in the repo suggests one';
  return {
    id: 'checks-none',
    kind: 'checks',
    level: 'blocks',
    text: "Teamtrail can't verify work yet: no checks",
    why: `${VERIFICATION_FILE} names no check that runs; ${seen}`,
    ...(add.length ? { fix: { kind: 'add-checks', checks: add } } : {}),
    ...(add.length ? {} : { howTo: ['Add a check in Settings → Verification'] }),
  };
}

/** What screening says an approved check does as the repo is now; a missing install is installFindings.ts's. */
function screened(input: ReadinessInput): ReadinessFinding[] {
  const out: ReadinessFinding[] = [];
  for (const f of input.screening) {
    if (f.cause === 'not-installed') continue;
    const blocks = f.severity === 'wont-run';
    out.push({
      id: `check:${f.check}`,
      kind: 'check',
      level: blocks ? 'blocks' : 'warns',
      text: blocks ? `${f.check} can't run as written: ${f.text}` : `${f.check} may not run: ${f.text}`,
      why: 'read from the repo before anything ran',
      checks: [f.check],
      howTo: [f.fix ? `Change it to: ${f.fix.run.join(' ')}` : 'Change it in Settings → Verification'],
    });
  }
  return out;
}

/** Whether there are checks at all, and what reading the repo says each will do. */
export function checkFindings(input: ReadinessInput): ReadinessFinding[] {
  const none = noChecks(input);
  return none ? [none] : screened(input);
}
