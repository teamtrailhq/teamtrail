import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { lanUrls } from '../src/serve/lanUrls';
import { listen, type Listening } from '../src/serve/listen';
import { listenFailure } from '../src/serve/listenFailure';
import { lookoutUrl } from '../src/serve/lookoutUrl';

/*
 * The Lookout's port is held on every loopback address, so no other local program can listen beside it and take
 * its origin (Chrome tries `::1` first for `localhost`; macOS lets a specific address in beside a wildcard).
 */
let ipv6 = false;
let open: Listening | undefined;
const others: net.Server[] = [];

/** What another program gets when it tries to listen on `host:port`: undefined when it can. */
function bindError(host: string, port: number): Promise<string | undefined> {
  const other = net.createServer();
  others.push(other);
  return new Promise((resolve) => {
    other.once('error', (e: NodeJS.ErrnoException) => resolve(e.code));
    other.listen({ port, host }, () => resolve(undefined));
  });
}

const make = () => http.createServer((_req, res) => res.end('lookout'));

/** Whom a request to `host:port` reaches. */
async function answer(host: string, port: number) {
  const name = host.includes(':') ? `[${host}]` : host;
  return (await fetch(`http://${name}:${port}/`)).text();
}

/** This machine's first address other devices reach, if it has one. */
const lanAddress = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .find((a) => !!a && a.family === 'IPv4' && !a.internal)?.address;

/**
 * A program on 127.0.0.1:port that, for every connection it gets, connects back to `targets` on the port from the
 * very source port it saw: the trick that fooled a check matching only the probe's source port.
 */
function connectBackSquatter(targets: string[]) {
  const squatter = net.createServer((socket) => {
    const localPort = socket.remotePort;
    for (const host of targets)
      net.connect({ host, port: (squatter.address() as net.AddressInfo).port, localPort }).on('error', () => {});
  });
  others.push(squatter);
  return squatter;
}

beforeAll(async () => {
  const probe = net.createServer();
  ipv6 = await new Promise<boolean>((resolve) => {
    probe.once('error', () => resolve(false));
    probe.listen({ port: 0, host: '::1' }, () => resolve(true));
  });
  probe.close();
});

afterEach(() => {
  for (const s of [...(open?.servers ?? []), ...others.splice(0)]) s.close();
  open = undefined;
});

describe('the Lookout holds every loopback socket of its port', () => {
  it('by default: another program can bind neither 127.0.0.1 nor ::1 while it runs', async () => {
    open = await listen({ make, port: 0, host: '127.0.0.1', retries: 0 });
    expect(await bindError('127.0.0.1', open.port)).toBe('EADDRINUSE');
    expect(await answer('127.0.0.1', open.port)).toBe('lookout');
    if (!ipv6) return;
    expect(await bindError('::1', open.port)).toBe('EADDRINUSE');
    expect(await answer('::1', open.port)).toBe('lookout');
  });

  it('with --host 0.0.0.0: neither loopback address can be taken beside the wildcard', async () => {
    open = await listen({ make, port: 0, host: '0.0.0.0', retries: 0 });
    expect(await bindError('127.0.0.1', open.port)).toBe('EADDRINUSE');
    expect(await answer('127.0.0.1', open.port)).toBe('lookout');
    if (!ipv6) return;
    expect(await bindError('::1', open.port)).toBe('EADDRINUSE');
    expect(await answer('::1', open.port)).toBe('lookout');
  });

  it('refuses to start beside a program already on ::1, naming the address; without --port it moves on', async () => {
    if (!ipv6) return;
    const squatter = net.createServer();
    others.push(squatter);
    await new Promise<void>((r) => squatter.listen({ port: 0, host: '::1' }, r));
    const port = (squatter.address() as net.AddressInfo).port;
    const refused = await listen({ make, port, host: '127.0.0.1', retries: 0 }).catch((e: unknown) => e);
    expect((refused as NodeJS.ErrnoException).code).toBe('EADDRINUSE');
    expect(listenFailure(refused)).toBe(
      `port ${port} is already in use on ::1 by another program; pick another with --port <n>`,
    );
    // nothing of the refused attempt stays bound: 127.0.0.1 is free again
    expect(await bindError('127.0.0.1', port)).toBeUndefined();
    open = await listen({ make, port, host: '127.0.0.1', retries: 20 });
    expect(open.port).toBeGreaterThan(port);
  });

  it('refuses to start beside a program already on 127.0.0.1, even one that connects back from the probe port', async () => {
    const targets = [lanAddress(), ipv6 ? '::1' : undefined].filter((h): h is string => !!h);
    const squatter = connectBackSquatter(targets);
    await new Promise<void>((r) => squatter.listen({ port: 0, host: '127.0.0.1' }, r));
    const port = (squatter.address() as net.AddressInfo).port;
    for (const host of ['127.0.0.1', '0.0.0.0', '::']) {
      const refused = await listen({ make, port, host, retries: 0 }).catch((e: unknown) => e);
      expect((refused as NodeJS.ErrnoException).code, host).toBe('EADDRINUSE');
      expect(listenFailure(refused), host).toContain(`port ${port} is already in use on 127.0.0.1`);
    }
  });

  it('never listens on a wildcard: --host 0.0.0.0 and :: become one socket per address the machine has', async () => {
    for (const host of ['0.0.0.0', '::']) {
      open = await listen({ make, port: 0, host, retries: 0 });
      const bound = open.servers.map((s) => (s.address() as net.AddressInfo).address);
      expect(bound, host).not.toContain('0.0.0.0');
      expect(bound, host).not.toContain('::');
      expect(open.addresses, host).toContain('127.0.0.1');
      for (const s of open.servers) s.close();
      open = undefined;
    }
  });

  it('with --host 0.0.0.0 another program can’t take the network address beside it, and only held ones are handed out', async () => {
    const lan = lanAddress();
    if (!lan) return;
    open = await listen({ make, port: 0, host: '0.0.0.0', retries: 0 });
    expect(open.addresses).toContain(lan);
    expect(await bindError(lan, open.port)).toBe('EADDRINUSE');
    expect(await answer(lan, open.port)).toBe('lookout');
    expect(lanUrls(open.addresses, open.port)).toContain(`http://${lan}:${open.port}/`);
    expect(lanUrls(['127.0.0.1', '::1'], open.port)).toEqual([]);
  });

  it('refuses to start beside a program already on the network address, naming it', async () => {
    const lan = lanAddress();
    if (!lan) return;
    const squatter = net.createServer();
    others.push(squatter);
    await new Promise<void>((r) => squatter.listen({ port: 0, host: lan }, r));
    const port = (squatter.address() as net.AddressInfo).port;
    const refused = await listen({ make, port, host: '0.0.0.0', retries: 0 }).catch((e: unknown) => e);
    expect(listenFailure(refused)).toContain(`port ${port} is already in use on ${lan}`);
    expect(await bindError('127.0.0.1', port)).toBeUndefined();
  });

  it('prints and opens an IP address, never localhost', () => {
    expect(lookoutUrl(7420)).toBe('http://127.0.0.1:7420/');
  });
});
