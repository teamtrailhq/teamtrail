import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { fromThisMachine, requestRefusal } from '@teamtrail/core/bridge';
import { bearerToken } from './bearerToken';
import { refuse } from './respond';
import { admit } from './sessionLimits';
import type { McpHosted, McpHttp, McpHttpOptions, McpPrincipal } from './types';

interface Session {
  principal: McpPrincipal;
  tokenId: string;
  transport: StreamableHTTPServerTransport;
  hosted: McpHosted;
  /** When a call last started or finished. The open notification stream (GET) is not a call. */
  lastCall: number;
  /** Calls being answered now, long waits included. */
  calls: number;
  ended: boolean;
}

const METHODS = new Set(['POST', 'GET', 'DELETE']);
const UNAUTHORIZED =
  'Unauthorized. This endpoint needs a token: create one in the Lookout (Settings → Remote agents) and send it as "Authorization: Bearer <token>".';
const THIS_MACHINE =
  'This endpoint answers this machine only. For agents on other machines, run `teamtrail mcp --http`.';

/**
 * The MCP tools over streamable HTTP, as one mountable request handler. It knows nothing about where it is
 * mounted, where tokens live or what a session serves: the host passes `auth` and `open`. Every request is
 * checked in this order: host and origin (and, with `thisMachineOnly`, where it connects from), method, token,
 * then the session, which only the token that opened it may use. Sessions end when the client says so, when
 * their token is revoked, after `idleMs` without a call, or when their token opens more than its share.
 */
export function createMcpHttp(o: McpHttpOptions): McpHttp {
  const sessions = new Map<string, Session>();
  const idleMs = o.idleMs ?? 60 * 60_000;
  const limits = { perToken: o.maxSessionsPerToken ?? 8, total: o.maxSessions ?? 200 };

  function end(id: string, s: Session, reason: string) {
    if (s.ended) return;
    s.ended = true;
    sessions.delete(id);
    s.hosted.close(reason);
    void s.hosted.server.close().catch(() => {});
  }

  const sweep = setInterval(() => {
    if (!sessions.size) return;
    const now = Date.now();
    // One read of the tokens for the whole sweep, however many sessions there are.
    const live = o.auth.snapshot();
    for (const [id, s] of sessions) {
      if (!live(s.principal)) end(id, s, 'Token revoked');
      else if (s.calls === 0 && now - s.lastCall > idleMs) end(id, s, 'Agent disconnected');
    }
  }, o.sweepMs ?? 1000);
  sweep.unref?.();

  /** A new session for an initialize request; nothing is kept when the request turns out not to be one. */
  async function start(principal: McpPrincipal, req: IncomingMessage, res: ServerResponse) {
    const room = admit(sessions, { tokenId: principal.id, ...limits });
    if (room.kind === 'refused') return refuse(res, 503, room.why);
    if (room.evict) end(room.evict[0], room.evict[1], 'Closed for a newer session of the same token');
    const hosted = await o.open(principal);
    const session: Session = {
      principal,
      tokenId: principal.id,
      hosted,
      lastCall: Date.now(),
      calls: 0,
      ended: false,
      transport: undefined!,
    };
    session.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      keepAliveMs: o.keepAliveMs,
      onsessioninitialized: (id) => void sessions.set(id, session),
      onsessionclosed: (id) => end(id, session, 'Agent disconnected'),
    });
    try {
      await hosted.server.connect(session.transport);
      await serve(session, req, res);
    } finally {
      const id = session.transport.sessionId;
      const kept = !!id && sessions.get(id) === session;
      if (!kept && !session.ended) {
        session.ended = true;
        hosted.close('Agent disconnected');
        void hosted.server.close().catch(() => {});
      }
    }
  }

  async function serve(s: Session, req: IncomingMessage, res: ServerResponse) {
    // The notification stream stays open as long as the client likes: it is not work, and keeps nothing alive.
    if (req.method === 'GET') return s.transport.handleRequest(req, res);
    s.calls++;
    s.lastCall = Date.now();
    res.once('close', () => {
      s.calls--;
      s.lastCall = Date.now();
    });
    await s.transport.handleRequest(req, res);
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const refusal = requestRefusal(req, o.allowedHosts);
    if (refusal) return refuse(res, 403, refusal);
    if (o.thisMachineOnly && !fromThisMachine(req, o.peer)) return refuse(res, 403, THIS_MACHINE);
    if (!METHODS.has(req.method ?? '')) return refuse(res, 405, 'Method not allowed.', { Allow: 'POST, GET, DELETE' });
    const token = bearerToken(req);
    const principal = token ? await o.auth.authenticate(token) : undefined;
    if (!principal) return refuse(res, 401, UNAUTHORIZED, { 'WWW-Authenticate': 'Bearer' });
    o.auth.used?.(principal);
    const id = req.headers['mcp-session-id'];
    if (id === undefined) return start(principal, req, res);
    const session = typeof id === 'string' ? sessions.get(id) : undefined;
    // A session answers only to the token that opened it; to anyone else it doesn't exist.
    if (!session || session.principal.id !== principal.id)
      return refuse(res, 404, 'Session not found. Initialize a new one.');
    await serve(session, req, res);
  }

  return {
    async handle(req, res) {
      try {
        await handle(req, res);
      } catch {
        // never the error's text: it could carry a path or a header
        refuse(res, 500, 'Internal error.');
      }
    },
    sessionCount: () => sessions.size,
    async close() {
      clearInterval(sweep);
      for (const [id, s] of sessions) end(id, s, 'Server stopped');
    },
  };
}
