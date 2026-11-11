// The Lookout's address, end to end against the built CLI: it prints and opens http://127.0.0.1:<port>/, never
// localhost, and while it runs no other program can listen on its port at 127.0.0.1 or ::1.
import net from 'node:net';

/** What another program gets when it tries to listen on `host:port`: 'free' when it can. */
function bindResult(host, port) {
  const other = net.createServer();
  return new Promise((resolve) => {
    other.once('error', (e) => resolve(e.code));
    other.listen({ port, host }, () => other.close(() => resolve('free')));
  });
}

/**
 * The running Lookout at `url` (started with `--host 0.0.0.0`) and its sign-in link `pair`, and `opened`: where
 * another one sent the browser it opened at start (verifyOpenSignedIn.mjs).
 */
export async function verifyLoopback({ url, pair, opened }) {
  const port = Number(new URL(url).port);
  const v4 = await bindResult('127.0.0.1', port);
  const v6 = await bindResult('::1', port);
  const ip = /^http:\/\/127\.0\.0\.1:\d+\//;
  const printed = ip.test(url) && ip.test(pair);
  const ok = printed && ip.test(opened) && v4 === 'EADDRINUSE' && ['EADDRINUSE', 'EADDRNOTAVAIL'].includes(v6);
  const said = `printed ${url}, opened ${opened}; another program binding its port on 127.0.0.1: ${v4}, on ::1: ${v6}`;
  return { ok, said };
}
