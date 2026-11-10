import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import { levelOf } from '../model/lifecycle';
import { OperationError } from '../planning/operations/operationError';
import { approvalItems } from '../verification/approvals';
import { checksApproval } from '../verification/checksApproval';
import { readVerificationConfig, VERIFICATION_FILE } from '../verification/configFile';
import { operatorAction, type OperatorAction, type OperatorRequest } from '../verification/operatorActions';
import { readEvidenceLog, ticketEvidence } from '../verification/ticketEvidence';
import { levelFor } from '../verification/verifyCompletion';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';
import { ELSEWHERE } from './thisMachineRoutes';
import { crossSite } from './trackerErrors';

const ACTIONS = new Set<OperatorAction>(['rerun', 'approve', 'accept', 'rework', 'unblock', 'level']);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function request(b: Record<string, unknown>): OperatorRequest {
  const mapId = str(b.mapId);
  if (!mapId || !ACTIONS.has(b.action as OperatorAction))
    throw new BadRequest('"mapId" and a known "action" are required');
  const level = b.level === null ? null : levelOf(b.level);
  if (b.action === 'level' && level === undefined) throw new BadRequest('"level" must be a verification level or null');
  return {
    action: b.action as OperatorAction,
    mapId,
    ticketId: str(b.ticketId),
    by: str(b.by) ?? 'trail lead',
    reason: str(b.reason),
    to: b.to === 'ready' || b.to === 'rework' ? b.to : undefined,
    ...(b.action === 'level' ? { level } : {}),
  };
}

/**
 * Verification routes of the bridge:
 *   GET  /verification/config                     the parsed `verification.json`, read-only, and whether the trail
 *                                                 lead approved its commands on this machine (`approval`)
 *   GET  /verification/ticket?mapId=&ticketId=    level, attempts and verdicts (newest first), the run in progress
 *   GET  /verification/log?path=                  the end of a check log under `.evidence/`
 *   GET  /verification/inbox                      tickets waiting on the trail lead (ApprovalItem[]), every trail
 *   POST /verification/action                     OperatorRequest → `{ attemptId? }`
 * The config file is edited in the repo, never through the API, so an agent
 * with API access cannot change what verifies its own work.
 */
export async function handleVerification(
  { root, active, local }: RouteContext & { local?: boolean },
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const p = url.pathname;
  const q = (k: string) => url.searchParams.get(k) ?? '';
  if (p === '/verification/config' && req.method === 'GET') {
    const read = readVerificationConfig(root);
    const { exists, errors, hash, config } = read;
    // whether its commands run on this machine yet: only once the trail lead approved this exact file here
    const { state, waiting } = checksApproval(root);
    sendJson(res, 200, { file: VERIFICATION_FILE, exists, errors, hash, config, approval: { state, waiting } });
    return true;
  }
  if (p === '/verification/ticket' && req.method === 'GET') {
    if (!q('mapId') || !q('ticketId')) throw new BadRequest('"mapId" and "ticketId" are required');
    const snap = await (await active()).loadMap(q('mapId'));
    const t = snap.tickets.find((x) => x.id === q('ticketId'));
    if (!t) return (sendJson(res, 404, { error: 'ticket not found' }), true);
    sendJson(res, 200, { level: levelFor(root, snap, t).info, ...ticketEvidence(root, snap.map.id, t.id) });
    return true;
  }
  if (p === '/verification/inbox' && req.method === 'GET') {
    const adapter = await active();
    const maps = await adapter.listMaps();
    const snaps = await Promise.all(maps.map((m) => adapter.loadMap(m.id)));
    sendJson(res, 200, { items: snaps.flatMap((s) => approvalItems(root, s)).sort((a, b) => a.at - b.at) });
    return true;
  }
  if (p === '/verification/log' && req.method === 'GET') {
    const log = readEvidenceLog(root, q('path'));
    if (!log) return (sendJson(res, 404, { error: 'no such log' }), true);
    sendJson(res, 200, log);
    return true;
  }
  if (p === '/verification/action' && req.method === 'POST') {
    if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
    const r = request(await readJson<Record<string, unknown>>(req, '{}'));
    // Approving, rejecting and re-running are steering. How much proof a trail or ticket needs is a trust setting.
    if (r.action === 'level' && local === false)
      return (sendJson(res, 403, { error: ELSEWHERE, elsewhere: true }), true);
    try {
      sendJson(res, 200, await operatorAction({ adapter: await active(), root, journal: journalFile(root) }, r));
    } catch (e) {
      if (!(e instanceof OperationError)) throw e;
      sendJson(res, 409, { error: e.message });
    }
    return true;
  }
  return false;
}
