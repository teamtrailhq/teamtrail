import { untrusted } from '../evidence/github/prText';
import { canonicalJson } from '../lib/canonicalJson';
import type { Proof, ProofSignature } from '../model/proof';
import { proofBadge } from './proofBadge';
import { proofMarker } from './proofMarker';

/** Agent-written text as inert Markdown: flattened and capped, then every character Markdown acts on escaped. */
const md = (text: string, max = 200) => untrusted(text, max).replace(/[\\*_[\]()#|!~+-]/g, (c) => `\\${c}`);

const date = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const short = (sha: string | null) => (sha ? sha.slice(0, 8) : 'none');

function checkLines(p: Proof): string[] {
  if (p.attempt.remote && !p.attempt.runner)
    return ['- No check ran here: the work was submitted from another machine.'];
  if (!p.checks.length) return ['- No checks ran.'];
  const by = p.attempt.runner ? [`Ran by ${md(p.attempt.runner, 60)}, on the pushed commit:`] : [];
  return [
    ...by,
    ...p.checks.map(
      (c) =>
        `- ${c.passed ? '✅' : '❌'} \`${md(c.argv.join(' '), 120)}\` (exit ${c.exitCode ?? 'none'}, ${Math.round(c.durationMs / 100) / 10}s)`,
    ),
  ];
}

function criteriaLines(p: Proof): string[] {
  const c = p.criteria;
  if (!c.lines.length) return ['- No acceptance criteria.'];
  const head = `${c.verified} verified by Teamtrail, ${c.claimed} claimed by the agent${c.confirmed ? '' : ', not confirmed by the trail lead'}`;
  return [`${head}:`, ...c.lines.map((l) => `- ${md(l)}`)];
}

function reviewLines(p: Proof): string[] {
  if (!p.reviews.length) return ['- No review.'];
  return p.reviews.map(
    (r) =>
      `- ${r.verdict} by ${md(r.by, 60)} (${r.byKind}${r.independent ? ', not the author' : ', NOT independent'}): ${md(r.summary)}`,
  );
}

function decisionLines(p: Proof): string[] {
  if (!p.decisions.length) return ['- None recorded.'];
  return p.decisions.map(
    (d) =>
      `- ${md(d.id, 20)}${d.superseded ? ' (superseded)' : ''}: ${md(d.summary)}, decided by ${d.decidedByName ? `${md(d.decidedByName, 60)} (${md(d.decidedBy, 60)})` : md(d.decidedBy, 60)}, ${date(d.decidedAt)} UTC`,
  );
}

function gitLines(p: Proof): string[] {
  const g = p.git;
  if (!g) return [];
  const flags = g.flags.length ? `, flagged: ${g.flags.map((f) => md(f, 40)).join(', ')}` : '';
  return [
    '',
    `**Changes:** ${short(g.base)} → ${short(g.head)} on ${md(g.branch ?? 'detached HEAD', 80)}, ${g.files} files (+${g.add} −${g.del})${flags}`,
  ];
}

/**
 * The proof as a pull request shows it. Everything an agent wrote is escaped; the hidden marker carries the digest
 * so a changed copy can be told from the original; the last line carries the proof itself (base64 of its canonical
 * JSON) so anyone can check the text against it (verifyProofText.ts).
 */
export function proofMarkdown(p: Proof, signature?: ProofSignature): string {
  const title = p.status === 'verified' ? 'Verified by Teamtrail' : 'Not verified by Teamtrail';
  const lines = [
    proofMarker(p.digest, signature),
    proofBadge(p.status),
    '',
    `### ${title}`,
    '',
    `**${md(p.ticket.key, 20)} ${md(p.ticket.title, 120)}** · ${md(p.trail, 80)} · level ${p.level}`,
    '',
    ...(p.gaps.length ? ['**Not yet proven:**', ...p.gaps.map((g) => `- ${md(g)}`), ''] : []),
    '**Checks Teamtrail ran:**',
    ...checkLines(p),
    '',
    '**Acceptance criteria:**',
    ...criteriaLines(p),
    '',
    '**Review:**',
    ...reviewLines(p),
    '',
    '**Decisions this relies on:**',
    ...decisionLines(p),
    ...gitLines(p),
    '',
    `<sub>Attempt ${md(p.attempt.id, 40)} by ${md(p.attempt.agent, 60)}${p.earlier.length ? ` after ${p.earlier.length} earlier` : ''} · ${p.digest.slice(0, 19)}… · Teamtrail records what ran on the trail lead's machine; it does not judge the code.</sub>`,
    '',
    `<!-- teamtrail:proof-data ${Buffer.from(canonicalJson(p)).toString('base64')} -->`,
  ];
  return lines.join('\n');
}
