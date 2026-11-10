import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { bearerToken } from './bearerToken';
import { requestRefusal } from './requestRefusal';
import { refuse } from './respond';
import type { McpHosted, McpHttp, McpHttpOptions, McpPrincipal } from './types';

interface Session {
  principal: McpPrincipal;
  transport: StreamableHTTPServerTransport;
  hosted: McpHosted;
  lastSeen: number;
  /** Requests being answered now, long waits and the notification stream included. */
  inFlight: number;
  ended: boolean;
}

const METHODS = new Set(['POST', 'GET', 'DELETE']);
const UNAUTHORIZED =
  'Unauthorized. This endpoint needs a token: create one in the Lookout (Settings → Remote agents) and send it as "Authorization: Bearer <token>".';

/**
 * The MCP tools over streamable HTTP, as one mountable request handler. It knows nothing about where it is
 * mounted, where tokens are kept or what a session serves: the host passes `auth` and `open`. Every request is
 * checked in this order: host and origin, method, token, then the session, which only the token that opened it
 * may use. Sessions end when the client says so, when their token is revoked, or after `idleMs` of silence.
 */
export function createMcpHttp(o: McpHttpOptions): McpHttp {
  const sessions = new Map<string, Session>();
  const idleMs = o.idleMs ?? 60 * 60_000;
  const maxSessions = o.maxSessions ?? 200;

  function end(id: string, s: Session, reason: string) {
    if (s.ended) return;
    s.ended = true;
    sessions.delete(id);
    s.hosted.close(reason);
    void s.hosted.server.close().catch(() => {});
  }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (!o.auth.live(s.principal)) end(id, s, 'Token revoked');
      else if (s.inFlight === 0 && now - s.lastSeen > idleMs) end(id, s, 'Agent disconnected');
    }
  }, o.sweepMs ?? 1000);
  sweep.unref?.();

  /** A new session for an initialize request; nothing is kept when the request turns out not to be one. */
  async function start(principal: McpPrincipal, req: IncomingMessage, res: ServerResponse) {
    if (sessions.size >= maxSessions) return refuse(res, 503, 'Too many sessions. Try again when one has ended.');
    const hosted = await o.open(principal);
    const session: Session = {
      principal,
      hosted,
      lastSeen: Date.now(),
      inFlight: 0,
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
    s.inFlight++;
    s.lastSeen = Date.now();
    res.once('close', () => {
      s.inFlight--;
      s.lastSeen = Date.now();
    });
    await s.transport.handleRequest(req, res);
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const refusal = requestRefusal(req, o.allowedHosts);
    if (refusal) return refuse(res, 403, refusal);
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
