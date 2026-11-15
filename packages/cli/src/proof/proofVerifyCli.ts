import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GitHubProofPublisher, proofKeysAt, verifyProofText, type ProofCheck } from '@teamtrail/core/node';
import { fail } from '../args/help';

interface VerifyOptions {
  dir: string;
  keysRef: string;
  file?: string;
  pr?: number;
  repo?: string;
  status: boolean;
}

const FLAGS = new Set(['--dir', '--keys-ref', '--pr', '--repo']);

/** `proof verify [file] | --pr <n> [--repo <owner/name>] [--set-status] [--keys-ref <ref>] [--dir <path>]`. */
function parse(argv: string[]): VerifyOptions {
  const o: VerifyOptions = { dir: '.teamtrail', keysRef: 'HEAD', status: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--set-status') o.status = true;
    else if (FLAGS.has(flag)) {
      const v = argv[++i];
      if (!v) fail(`${flag} needs a value`);
      if (flag === '--dir') o.dir = v;
      if (flag === '--keys-ref') o.keysRef = v;
      if (flag === '--repo') o.repo = v;
      if (flag === '--pr') o.pr = Number(v);
    } else if (flag.startsWith('-')) fail(`unknown option: ${flag}`);
    else o.file = flag;
  }
  if (o.pr !== undefined && !(Number.isInteger(o.pr) && o.pr > 0)) fail('--pr needs a pull request number');
  return o;
}

function report(label: string, c: ProofCheck) {
  const what = c.proof ? `${c.proof.ticket.key} ${c.proof.ticket.title}` : label;
  const mark = c.verified ? 'verified' : 'NOT verified';
  process.stdout.write(`${mark}: ${what}${c.keyId ? ` (key ${c.keyId})` : ''}\n`);
  for (const p of c.problems) process.stdout.write(`  - ${p}\n`);
}

/** A pull request's proofs: every one must verify at the PR's head, and there must be one. */
async function verifyPr(o: VerifyOptions, keys: Map<string, string>) {
  const repo = o.repo ?? process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!repo || !token) fail('--pr needs --repo (or GITHUB_REPOSITORY) and a GITHUB_TOKEN or GH_TOKEN');
  const gh = new GitHubProofPublisher({ repo, token, apiUrl: process.env.GITHUB_API_URL });
  const { headSha, texts } = await gh.proofTexts(o.pr!);
  const checks = texts.map((text) => verifyProofText({ text, keys, head: headSha }));
  checks.forEach((c, i) => report(`proof ${i + 1}`, c));
  const ok = checks.length > 0 && checks.every((c) => c.verified);
  if (!checks.length) process.stdout.write(`No Teamtrail proof on pull request #${o.pr}.\n`);
  if (o.status) {
    const first = checks.find((c) => !c.verified)?.problems[0] ?? 'No Teamtrail proof on this pull request.';
    const description = ok ? `${checks.length} proof(s) verified at ${headSha.slice(0, 7)}` : first.slice(0, 140);
    await gh.setStatus(headSha, {
      state: ok ? 'success' : 'failure',
      description,
      context: 'Teamtrail proof verified',
    });
  }
  return ok;
}

/**
 * `teamtrail proof verify`: checks a Teamtrail proof report anyone can see, against the proof keys committed at
 * `--keys-ref` (default HEAD; a CI check passes the base branch). A file (or stdin) holds one report; `--pr` checks
 * every report on a pull request at its head commit, and `--set-status` records the result as a commit status.
 * Exit code 0 when everything verifies, 1 otherwise.
 */
export async function proofVerifyCli(argv: string[]) {
  const o = parse(argv);
  const keys = await proofKeysAt(path.resolve(process.cwd(), o.dir), o.keysRef);
  if (!keys.size) process.stdout.write(`No proof keys committed at ${o.keysRef} in ${o.dir}/proof-keys.\n`);
  if (o.pr !== undefined) {
    process.exitCode = (await verifyPr(o, keys)) ? 0 : 1;
    return;
  }
  const text = readFileSync(o.file ?? 0, 'utf8');
  const c = verifyProofText({ text, keys });
  report(o.file ?? 'stdin', c);
  process.exitCode = c.verified ? 0 : 1;
}
