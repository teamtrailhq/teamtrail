import { type ActivityStream, type AgentSessionDoc, type TicketLease } from '@teamtrail/core';
import { apiBase } from './apiBase';
import { type LeaseBoard } from './leaseBoard';
import { newestWins } from './newestWins';
import { onServerEvent, onStreamOpen } from './trackerChanges';

function sendAnswers(activity: ActivityStream) {
  activity.remoteAnswer = (q, text, author) => {
    void fetch(`${apiBase()}/agents/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: q.sessionId, questionId: q.id, text, author }),
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      })
      .catch((e: Error) =>
        activity.push({
          source: 'system',
          level: 'alert',
          sessionId: q.sessionId,
          text: `Answer not delivered to ${q.agent} · ${e.message}`,
        }),
      );
  };
}

/** The leases as the server has them now; the `leases` event carries them all, so it is newer than loads before it. */
function mirrorLeases(leases: LeaseBoard) {
  const order = newestWins();
  const load = () => {
    const fresh = order.start();
    void fetch(`${apiBase()}/agents/leases`)
      .then((r) => (r.ok ? (r.json() as Promise<{ leases: TicketLease[] }>) : { leases: [] }))
      .then(({ leases: l }) => fresh() && leases.set(l))
      .catch(() => {});
  };
  onServerEvent('leases', (data) => {
    order.pushed();
    leases.set((JSON.parse(data) as { leases: TicketLease[] }).leases);
  });
  onStreamOpen(load);
  load();
}

/** Agent sessions; an `agent` event carries one session, so a load started before it keeps that session as sent. */
function mirrorSessions(activity: ActivityStream) {
  let events = 0;
  const sentAt = new Map<string, number>();
  const load = () => {
    const since = events;
    void fetch(`${apiBase()}/agents`)
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: AgentSessionDoc[] }>) : { sessions: [] }))
      .then(({ sessions }) =>
        [...sessions]
          .reverse()
          .filter((d) => (sentAt.get(d.session.id) ?? 0) <= since)
          .forEach((d) => activity.syncRemote(d)),
      )
      .catch(() => {});
  };
  onServerEvent('agent', (data) => {
    const doc = JSON.parse(data) as AgentSessionDoc;
    sentAt.set(doc.session.id, ++events);
    activity.syncRemote(doc);
  });
  onStreamOpen(load);
  load();
}

/**
 * Mirror agent sessions reported over MCP (see core agentLink.ts) and send trail lead answers back to them. Live on
 * the shared event stream, and loaded again each time it opens: nothing is sent while it is down.
 */
export function linkAgents(activity: ActivityStream, leases: LeaseBoard) {
  sendAnswers(activity);
  mirrorLeases(leases);
  mirrorSessions(activity);
}
