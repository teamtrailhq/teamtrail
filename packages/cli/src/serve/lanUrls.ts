const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1)$/;

/**
 * Where other devices on the network reach the Lookout, for Settings → Pair a device: the addresses it holds
 * besides loopback (listen.ts), IPv4 first. None when it listens on this machine only (the default). Only held
 * addresses are handed out: an interface that appeared after the start isn't served until a restart.
 */
export function lanUrls(held: string[], port: number): string[] {
  const lan = held.filter((h) => !LOOPBACK.test(h));
  const ordered = [...lan.filter((h) => !h.includes(':')), ...lan.filter((h) => h.includes(':'))];
  return ordered.map((h) => (h.includes(':') ? `http://[${h}]:${port}/` : `http://${h}:${port}/`));
}
