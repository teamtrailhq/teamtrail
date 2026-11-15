// Verified by Teamtrail: a verified ticket's proof, from the MCP tool an agent puts in its PR and from
// `teamtrail proof` in the terminal. Both read what this machine recorded and give the same digest, signed with
// this machine's key; `teamtrail proof verify` checks it against the key once committed, and refuses an edited copy.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A scratch git repo holding only the tracker folder's committed proof keys, and `proof verify` run in it. */
function verifyElsewhere({ cli, repo, text }) {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-verify-proof-'));
  fs.cpSync(path.join(repo, '.teamtrail', 'proof-keys'), path.join(other, '.teamtrail', 'proof-keys'), {
    recursive: true,
  });
  const git = (...a) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...a], { cwd: other, stdio: 'pipe' });
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'proof keys');
  const run = (t) => {
    fs.writeFileSync(path.join(other, 'report.md'), t);
    return spawnSync(process.execPath, [cli, 'proof', 'verify', 'report.md'], { cwd: other, encoding: 'utf8' });
  };
  const good = run(text);
  const edited = run(text.replace('Verified by Teamtrail', 'Verified by Teamtrail, honestly'));
  fs.rmSync(other, { recursive: true, force: true });
  return { good, edited };
}

export async function verifyProof({ call, cli, repo, ticket, log }) {
  const tool = await call('proof_report', { ticket });
  const run = spawnSync(process.execPath, [cli, 'proof', ticket, '--json'], { cwd: repo, encoding: 'utf8' });
  const json = run.status === 0 ? JSON.parse(run.stdout) : undefined;
  const md = spawnSync(process.execPath, [cli, 'proof', ticket], { cwd: repo, encoding: 'utf8' });
  const { good, edited } = verifyElsewhere({ cli, repo, text: md.stdout });
  const ok =
    tool.status === 'verified' &&
    tool.signed === true &&
    tool.markdown.startsWith(`<!-- teamtrail:proof v1 ${tool.digest} key:`) &&
    json?.digest === tool.digest &&
    json?.checks?.[0]?.name === 'check' &&
    md.stdout.includes('Verified by Teamtrail') &&
    good.status === 0 &&
    edited.status === 1 &&
    /edited after Teamtrail wrote it/.test(edited.stdout);
  log(
    `${ticket} proof ${ok ? 'matches' : 'does NOT match'}: ${tool.status} ${tool.digest.slice(0, 19)}…, signed ${tool.signed}, teamtrail proof exit ${run.status}; verify elsewhere ${good.status} (${good.stdout.trim().split('\n')[0]}), edited copy ${edited.status}`,
  );
  return ok;
}
