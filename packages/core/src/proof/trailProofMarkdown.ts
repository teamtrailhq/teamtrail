import { untrusted } from '../evidence/github/prText';
import { canonicalJson } from '../lib/canonicalJson';
import type { ProofSignature } from '../model/proof';
import type { TrailProof, TrailProofRun } from '../model/trailProof';
import { proofBadge } from './proofBadge';
import { proofMarker } from './proofMarker';

/** Agent-written text as inert Markdown: flattened and capped, then every character Markdown acts on escaped. */
const md = (text: string, max = 200) => untrusted(text, max).replace(/[\\*_[\]()#|!~+-]/g, (c) => `\\${c}`);
const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 8) : 'none');

const RESULT: Record<TrailProofRun['result'], string> = {
  pass: 'passed',
  fail: 'failed',
  running: 'still running',
  unavailable: 'could not run',
};

function ticketLines(p: TrailProof): string[] {
  if (!p.tickets.length) return ['- No ticket is done.'];
  return p.tickets.map(
    (t) =>
      `- ${t.status === 'verified' ? '✅' : '❌'} ${md(t.key, 20)} ${md(t.title, 120)} · ${t.digest.slice(0, 19)}…`,
  );
}

function mergeLine(m: TrailProofRun['merges'][number]): string {
  const what = m.pr !== undefined ? `PR #${m.pr}` : md(m.key, 20);
  if (m.state !== 'merged') return `${what} ${m.state === 'nothing' ? 'had nothing to merge' : `was ${m.state}`}`;
  return `${what} (${short(m.commit)})${m.contained ? '' : ' NOT in that commit'}`;
}

function runLines(p: TrailProof): string[] {
  const r = p.together;
  if (!r) return ['- No run yet.'];
  const where = `${md(r.branch ?? 'the default branch', 80)} at ${short(r.commit)}`;
  const by = r.runner ? `, run by ${md(r.runner, 60)}` : '';
  const scope = r.complete ? '' : ' Not every ticket was done and merged then, so it does not verify the trail.';
  return [
    `${RESULT[r.result]} on ${where}${by}.${scope}`,
    ...r.checks.map(
      (c) =>
        `- ${c.passed ? '✅' : '❌'} \`${md(c.argv.join(' '), 120)}\` (exit ${c.exitCode ?? 'none'}, ${Math.round(c.durationMs / 100) / 10}s)`,
    ),
    ...(r.merges.length ? [`Merges: ${r.merges.map(mergeLine).join(', ')}.`] : []),
  ];
}

/**
 * A trail's proof as a pull request or a report shows it, signed like a ticket's: the marker carries the digest and
 * signature, the last line the proof itself (base64 of its canonical JSON). Everything an agent wrote is escaped.
 */
export function trailProofMarkdown(p: TrailProof, signature?: ProofSignature): string {
  const title = p.status === 'verified' ? 'Trail verified by Teamtrail' : 'Trail not verified by Teamtrail';
  return [
    proofMarker(p.digest, signature),
    proofBadge(p.status),
    '',
    `### ${title}`,
    '',
    `**${md(p.trail.title, 120)}** · ${p.tickets.length} done ticket${p.tickets.length === 1 ? '' : 's'}`,
    '',
    ...(p.gaps.length ? ['**Not yet proven:**', ...p.gaps.map((g) => `- ${md(g, 300)}`), ''] : []),
    '**Tickets, each with its own proof:**',
    ...ticketLines(p),
    '',
    '**Checks on main after merging, all together:**',
    ...runLines(p),
    '',
    `<sub>${p.digest.slice(0, 19)}… · Teamtrail records what ran on the trail lead's machine; it does not judge the code.</sub>`,
    '',
    `<!-- teamtrail:trail-proof-data ${Buffer.from(canonicalJson(p)).toString('base64')} -->`,
  ].join('\n');
}
