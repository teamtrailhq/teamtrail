import type { WebSocket } from 'ws';
import { secrets } from '../crypto/secrets';
import { RateLimit } from '../http/RateLimit';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import type { ServerMessage } from '../types';
import { LinkSocket } from './LinkSocket';
import { proxyCall } from './proxyCall';

type HubContext = Omit<ServiceContext, 'hub' | 'httpLimit' | 'recentEvents' | 'replays' | 'offlineSaid'>;
type Closing = Extract<ServerMessage, { type: 'closed' }>['reason'];

/**
 * The linked Teamtrails connected now, by link, and the sockets still waiting for their hello (capped in all and
 * per client address). The service must run as one instance: this, like the replay and event records, is memory.
 */
export class Hub {
  private online = new Map<string, LinkSocket[]>();
  private waiting = new Set<LinkSocket>();
  private calls: RateLimit;

  constructor(private ctx: HubContext) {
    this.calls = new RateLimit({ burst: LIMITS.callBurst, perMinute: LIMITS.callsPerMinute, now: ctx.now });
  }

  /** A new socket, or false (and closed) when too many are waiting for their hello. */
  attach(ws: WebSocket, address: string) {
    const fromAddress = [...this.waiting].filter((s) => s.o.address === address).length;
    if (this.waiting.size >= LIMITS.pendingSockets || fromAddress >= LIMITS.pendingPerAddress) {
      ws.close(1013, 'busy');
      return false;
    }
    const socket = new LinkSocket(ws, {
      address,
      authenticate: (token) => this.ctx.store.linkByTokenHash(secrets.hash(token)),
      ready: (s) => void this.ready(s),
      closed: (s) => this.drop(s),
      call: (s, c) => this.call(s, c),
      now: this.ctx.now,
    });
    this.waiting.add(socket);
    return true;
  }

  /** The most recently connected socket among these links, or undefined when none of them is online. */
  pick(linkIds: string[]) {
    const sockets = linkIds.flatMap((id) => this.online.get(id) ?? []);
    return sockets.sort((a, b) => b.connectedAt - a.connectedAt)[0];
  }

  /** Closes every socket of these links (disconnected, uninstalled, replaced). */
  revoke(linkIds: string[], reason: Closing) {
    for (const id of linkIds) for (const s of this.online.get(id) ?? []) s.close(reason);
  }

  closeAll() {
    for (const s of this.waiting) s.close('disconnected');
    for (const sockets of this.online.values()) for (const s of sockets) s.close('disconnected');
  }

  private async ready(s: LinkSocket) {
    this.waiting.delete(s);
    const link = s.link!;
    const workspace = await this.ctx.store.workspace(link.teamId);
    if (!workspace) return s.close('uninstalled');
    if (!s.open) return;
    const sockets = [...(this.online.get(link.id) ?? []), s];
    while (sockets.length > LIMITS.socketsPerLink) sockets.shift()?.close('replaced');
    this.online.set(link.id, sockets);
    await this.ctx.store.touchLink(link.id, this.ctx.now());
    this.ctx.log('connected', { link: link.id, team: link.teamId });
    s.send({
      type: 'ready',
      linkId: link.id,
      teamId: link.teamId,
      userId: link.userId,
      botUserId: workspace.botUserId,
      scopes: workspace.scopes,
    });
  }

  private drop(s: LinkSocket) {
    this.waiting.delete(s);
    if (!s.link) return;
    const left = (this.online.get(s.link.id) ?? []).filter((x) => x !== s);
    if (left.length) this.online.set(s.link.id, left);
    else this.online.delete(s.link.id);
    this.ctx.log('disconnected', { link: s.link.id });
  }

  private async call(s: LinkSocket, c: { method: string; args: unknown }) {
    const link = s.link!;
    if (!this.calls.take(link.id)) return { ok: false as const, error: 'ratelimited' };
    const current = await this.ctx.store.link(link.id);
    if (!current) {
      setTimeout(() => s.close('disconnected'), 0);
      return { ok: false as const, error: 'unknown_link' };
    }
    return proxyCall(this.ctx, current, c);
  }
}
