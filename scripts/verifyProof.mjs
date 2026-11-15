// Verified by Teamtrail: a verified ticket's proof, from the MCP tool an agent puts in its PR and from
// `teamtrail proof` in the terminal. Both read what this machine recorded and give the same digest.
import { spawnSync } from 'node:child_process';

export async function verifyProof({ call, cli, repo, ticket, log }) {
  const tool = await call('proof_report', { ticket });
  const run = spawnSync(process.execPath, [cli, 'proof', ticket, '--json'], { cwd: repo, encoding: 'utf8' });
  const json = run.status === 0 ? JSON.parse(run.stdout) : undefined;
  const md = spawnSync(process.execPath, [cli, 'proof', ticket], { cwd: repo, encoding: 'utf8' });
  const ok =
    tool.status === 'verified' &&
    tool.markdown.includes(`<!-- teamtrail:proof v1 ${tool.digest} -->`) &&
    json?.digest === tool.digest &&
    json?.checks?.[0]?.name === 'check' &&
    md.stdout.includes('Verified by Teamtrail');
  log(
    `${ticket} proof ${ok ? 'matches' : 'does NOT match'}: ${tool.status} ${tool.digest.slice(0, 19)}…, teamtrail proof exit ${run.status}${run.stderr ? ` (${run.stderr.trim()})` : ''}`,
  );
  return ok;
}
