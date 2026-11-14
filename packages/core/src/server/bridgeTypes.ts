import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import type { DecisionRecord } from '../model/types';
import type { PeerAddress } from './requestGuard';
import type { TrackerRoutesOptions } from './trackerContext';

export interface TrackerBridge {
  root: string;
  /**
   * Handles a request whose URL has already had the API prefix stripped:
   *   GET  /list, GET|PUT /file?path=        raw tracker files (the browser's MarkdownFs)
   *   GET  /events                           SSE: `{ path }` per changed file; named `decision` events (DecisionEvent);
   *                                          named `agent` events (AgentSessionDoc) when an agent session reports
   *   GET  /agents                           `{ sessions: AgentSessionDoc[] }` running and recent agent sessions
   *   POST /agents/answer                    body `{ sessionId, questionId, text, author? }` → AgentAnswer
   *   GET  /agents/leases                    `{ leases: TicketLease[] }` claim leases and recent tombstones; SSE `leases` on change
   *   POST /agents/leases/release            body `{ mapId, ticketId, by? }` → `{ returned }`: back to the queue with a handoff comment
   *   GET  /verification/sync[?mapId=]       `{ status: PrSyncStatus, tickets: TicketSync[] }` PR/CI evidence and flags;
   *                                          SSE `verification` (VerificationSyncEvent) after each reconciler tick
   *   PUT  /verification/sync/link           body `{ mapId, ticketId, pr: number | null }` link or unlink a PR
   *   GET  /decisions[?trail=<id>]         `{ decisions: DecisionRecord[] }`
   *   POST /decisions                        body `{ trail, appendToTrail?, ...DecisionInput }` → DecisionRecord (idempotent per source.kind + source.ref)
   *   POST /decisions/<id>/supersede         body `{ trail, ...DecisionInput }` → the new DecisionRecord
   *   GET  /remote-agents                    `{ tokens: RemoteTokenView[], endpoints: McpEndpoint[] }` who may reach the MCP
   *                                          endpoint over HTTP; SSE `remote-agents` when that changes (remoteAgentRoutes.ts)
   *   POST /remote-agents/tokens             body `{ name }` → `{ token, created, … }`: the token's value, this once
   *   POST /remote-agents/tokens/revoke      body `{ id }`; the token's sessions end
   *   /trackers*, /tracker/<kind>/*          GitHub / Linear settings and API (trackerRoutes.ts)
   * Decision routes use the project's active tracker (local markdown, GitHub or Linear).
   */
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  /** The project's active tracker (local markdown, GitHub or Linear). */
  active(): Promise<TrackerAdapter>;
  close(): void;
}

/** Payload of the SSE `decision` event. */
export interface DecisionEvent {
  kind: 'decision.recorded' | 'decision.superseded' | 'decision.updated';
  mapId: string;
  decision: DecisionRecord;
}

/** What an optional server module (e.g. the Slack connector) gets from the bridge. */
export interface BridgeContext {
  root: string;
  /** The project's active tracker (local markdown, GitHub or Linear). */
  active(): Promise<TrackerAdapter>;
  /** The Lookout's URL, once it is serving. */
  url(): string | undefined;
}

export interface BridgePlugin {
  /** Return true when the request was handled. The URL has the API prefix stripped. */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
  close(): void;
}

export type BridgePluginFactory = (ctx: BridgeContext) => BridgePlugin;

export interface BridgeOptions extends Omit<TrackerRoutesOptions, 'root' | 'markdown'> {
  plugins?: BridgePluginFactory[];
  /** Who is on the other end of a connection; default the socket's remote address. Tests stand in another device. */
  peer?: PeerAddress;
  /** Host names besides IP addresses and localhost the bridge answers (hosted mode: the workspace's own). */
  allowedHosts?: string[];
  /** Whom `/events` streams are counted for (at most 16 each); default the socket's address. */
  streamKey?: (req: IncomingMessage) => string;
  url?: () => string | undefined;
  /** How often lease files are polled and expired leases returned to the queue. */
  leases?: { pollMs?: number; reapMs?: number };
  /** PR/CI reconciler (watchVerification.ts): delay before the first tick. Later ticks follow `github.pollSec`. */
  reconciler?: { firstMs?: number };
  /** How often active claim branches are compared for overlapping changes (watchIntegration.ts). */
  integration?: { pollMs?: number };
  /** How often the attention queue is recomputed for the `attention` event (watchAttention.ts). */
  attention?: { pollMs?: number };
}
