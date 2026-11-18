import { createHash } from 'node:crypto';
import { canonicalJson } from '../lib/canonicalJson';
import type { Proof } from '../model/proof';
import type { TrailRun, TrailTogether } from '../model/trailChecks';
import type { TrailDoneInput } from '../model/trailDone';
import type { TrailProof, TrailProofRun } from '../model/trailProof';
import { trailDone } from '../planning/trailDone';

export interface TrailProofInput {
  trail: TrailProof['trail'];
  tickets: TrailDoneInput['tickets'];
  /** The proof of each ticket closed as completed. */
  proofs: Proof[];
  pendingReroutes: number;
  together: TrailTogether;
  /** The trail lead skipped discovery here (TrailDoneInput). */
  discoverySkipped?: boolean;
  /** The trail's latest combined run. */
  run?: TrailRun;
}

const passed = (c: TrailRun['checks'][number]) => c.passed;

function runOf(run: TrailRun): TrailProofRun {
  return {
    id: run.id,
    commit: run.commit,
    branch: run.branch,
    result: run.result,
    complete: run.complete,
    by: run.by,
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    ...(run.runner ? { runner: run.runner } : {}),
    checks: run.checks.map((c) => ({
      name: c.name,
      argv: c.argv,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      passed: passed(c),
    })),
    merges: run.merges.map((m) => ({
      key: m.key,
      state: m.state,
      ...(m.pr !== undefined ? { pr: m.pr } : {}),
      ...(m.commit ? { commit: m.commit } : {}),
      ...(m.contained !== undefined ? { contained: m.contained } : {}),
    })),
  };
}

/** Why the trail isn't verified, one line each, from the same judgement the Lookout shows (trailDone). */
function gapsOf(input: TrailProofInput, done: ReturnType<typeof trailDone>): string[] {
  if (done.kind === 'verified') return [];
  if (done.kind === 'not-done') return [`${done.reason}.`];
  const tickets = input.proofs
    .filter((p) => p.status !== 'verified')
    .map((p) => `${p.ticket.key} is not verified${p.gaps[0] ? `: ${p.gaps[0]}` : '.'}`);
  const missing = done.unverified.filter((id) => !input.proofs.some((p) => p.ticket.id === id));
  const together = done.together.kind === 'passed' ? [] : [`Not verified together on main: ${done.together.reason}.`];
  return [...tickets, ...missing.map((id) => `Ticket ${id} has no proof.`), ...together];
}

/**
 * The proof of a whole trail: every done ticket's proof, by digest, and the combined run on the default branch.
 * Verified only when the trail is (planning/trailDone.ts): every ticket verified and the checks passed together at a
 * commit holding all of their merges. Pure and deterministic, like a ticket's proof.
 */
export function buildTrailProof(input: TrailProofInput): TrailProof {
  const statuses = Object.fromEntries(input.proofs.map((p) => [p.ticket.id, p.status]));
  const done = trailDone({ ...input, proofs: statuses });
  const body: Omit<TrailProof, 'digest'> = {
    v: 1,
    kind: 'trail',
    trail: input.trail,
    status: done.kind === 'verified' ? 'verified' : 'not-verified',
    gaps: gapsOf(input, done),
    tickets: input.proofs.map((p) => ({
      id: p.ticket.id,
      key: p.ticket.key,
      title: p.ticket.title,
      status: p.status,
      gaps: p.gaps,
      digest: p.digest,
    })),
    ...(input.run ? { together: runOf(input.run) } : {}),
  };
  return { ...body, digest: `sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}` };
}
