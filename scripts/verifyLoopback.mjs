// The Lookout's address, end to end against the built CLI: it prints and opens http://127.0.0.1:<port>/, never
// localhost, and while it runs no other program can listen on its port at 127.0.0.1 or ::1.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

/** What another program gets when it tries to listen on `host:port`: 'free' when it can. */
function bindResult(host, port) {
  const other = net.createServer();
  return new Promise((resolve) => {
    other.once('error', (e) => resolve(e.code));
    other.listen({ port, host }, () => other.close(() => resolve('free')));
  });
}

/** The URL `teamtrail` hands the browser at start, through a stand-in for the platform's opener on PATH. */
async function openedUrl({ cli, env }) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-open-e2e-'));
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const bin = path.join(top, 'bin');
  const record = path.join(top, 'opened.txt');
  fs.mkdirSync(bin);
  for (const name of ['open', 'xdg-open']) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "$@" >> '${record}'\n`, { mode: 0o755 });
  }
  const pathEnv = `${bin}${path.delimiter}${env.PATH ?? ''}`;
  const server = spawn(process.execPath, [cli, '--port', '0'], { cwd: top, env: { ...env, PATH: pathEnv } });
  try {
    const until = Date.now() + 15_000;
    while (!fs.existsSync(record) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    return fs.existsSync(record) ? fs.readFileSync(record, 'utf8').trim() : 'nothing opened';
  } finally {
    await new Promise((r) => (server.once('exit', r), server.kill('SIGTERM')));
    fs.rmSync(top, { recursive: true, force: true });
  }
}

/** The running Lookout at `url` (started with `--host 0.0.0.0`) and its sign-in link `pair`; a fresh one for the opener. */
export async function verifyLoopback({ cli, env, url, pair }) {
  const port = Number(new URL(url).port);
  const v4 = await bindResult('127.0.0.1', port);
  const v6 = await bindResult('::1', port);
  const opened = await openedUrl({ cli, env });
  const ip = /^http:\/\/127\.0\.0\.1:\d+\//;
  const printed = ip.test(url) && ip.test(pair);
  const ok = printed && ip.test(opened) && v4 === 'EADDRINUSE' && ['EADDRINUSE', 'EADDRNOTAVAIL'].includes(v6);
  const said = `printed ${url}, opened ${opened}; another program binding its port on 127.0.0.1: ${v4}, on ::1: ${v6}`;
  return { ok, said };
}
