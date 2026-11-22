import type { ChangedFile, EvidenceFlag, GitBaseline, GitTreeState } from '../model/evidence';
import type { TicketType } from '../model/types';
import type { VerificationConfig } from '../model/verification';
import { noChangesFlag } from './noChangesFlag';
import { scopeFlag } from './scopeFlag';

/** Files another working or verifying ticket changed. */
export interface OtherWork {
  ticketKey: string;
  worktree: string | null;
  files: string[];
}

export interface FlagInput {
  base?: GitBaseline;
  now?: GitTreeState;
  /** Why there is no `now`. */
  noGit?: string;
  changed: ChangedFile[];
  ticketType: TicketType;
  noChanges: VerificationConfig['noChanges'];
  /** The agent says the ticket needed no code change; it still shows, as info. */
  noCodeReason?: string;
  configHash?: string;
  /** A setup ticket's own proposal of the checks: nothing was approved at its claim (GitEvidence.setup). */
  setup?: boolean;
  /** The globs the agent declared at its claim, and what changes outside them do (evidence/scopeFlag.ts). */
  touches?: string[];
  scope?: VerificationConfig['scope'];
  /** Whether the base head is an ancestor of the current head (`undefined`: not known). */
  descends?: boolean;
  others: OtherWork[];
}

const short = (sha?: string | null) => sha?.slice(0, 8) ?? 'none';

function overlap(i: FlagInput): EvidenceFlag[] {
  const mine = new Set(i.changed.map((c) => c.path));
  const out: EvidenceFlag[] = [];
  const hit = i.others.map((o) => ({ ...o, files: o.files.filter((f) => mine.has(f)) })).filter((o) => o.files.length);
  const shared = hit.filter((o) => o.worktree && o.worktree === i.now?.toplevel);
  const apart = hit.filter((o) => !shared.includes(o));
  const files = (os: OtherWork[]) => [...new Set(os.flatMap((o) => o.files))].sort();
  if (apart.length)
    out.push({
      kind: 'overlap',
      level: 'warn',
      message: `changed files also changed by ${apart.map((o) => o.ticketKey).join(', ')}`,
      files: files(apart),
      tickets: apart.map((o) => o.ticketKey),
    });
  if (shared.length)
    out.push({
      kind: 'shared-worktree',
      level: 'info',
      message: `shared worktree with ${shared.map((o) => o.ticketKey).join(', ')} · attribution approximate`,
      files: files(shared),
      tickets: shared.map((o) => o.ticketKey),
    });
  return out;
}

function history(base: GitTreeState, now: GitTreeState, descends?: boolean): EvidenceFlag[] {
  if (base.branch !== now.branch)
    return [
      {
        kind: 'branch-switch',
        level: descends === false ? 'alert' : 'info',
        message: `branch ${base.branch ?? 'detached'} → ${now.branch ?? 'detached'}${descends === false ? ` · ${short(now.head)} does not descend from ${short(base.head)}` : ''}`,
      },
    ];
  if (descends === false)
    return [
      {
        kind: 'history-rewritten',
        level: 'alert',
        message: `${now.branch ?? 'HEAD'} was reset or rewritten: ${short(now.head)} does not descend from ${short(base.head)}`,
      },
    ];
  return [];
}

/** What a human should know about a completion's git evidence; `effect` flags change the attempt's result. */
export function evidenceFlags(i: FlagInput): EvidenceFlag[] {
  const out: EvidenceFlag[] = [];
  if (i.setup)
    out.push({
      kind: 'setup',
      level: 'info',
      message: 'the setup ticket proposed these checks; the trail lead approved them before they ran',
    });
  else if (i.base && (i.base.configHash ?? null) !== (i.configHash ?? null))
    out.push({
      kind: 'config-changed',
      level: 'alert',
      message: 'verification.json changed since the claim; a human has to confirm the checks',
      effect: 'human',
    });
  if (!i.now) {
    out.push({ kind: 'no-git', level: 'info', message: `${i.noGit ?? 'no git'}: stale detection is off` });
    return out;
  }
  if (!i.base?.git) {
    out.push({
      kind: 'no-baseline',
      level: 'warn',
      message: 'no baseline this machine recorded at the claim: changes cannot be told apart from earlier work',
    });
    return out;
  }
  out.push(...history(i.base.git, i.now, i.descends));
  if (!i.changed.length) out.push(noChangesFlag(i));
  const scope = scopeFlag({ changed: i.changed, touches: i.touches, scope: i.scope ?? 'flag' });
  if (scope) out.push(scope);
  out.push(...overlap(i));
  return out;
}

/** The strongest effect among the flags: what the attempt must do before (or instead of) running checks. */
export function flagEffect(flags: EvidenceFlag[]) {
  const f = flags.find((x) => x.effect === 'human') ?? flags.find((x) => x.effect === 'fail');
  return f ? { effect: f.effect!, reason: f.message } : undefined;
}
