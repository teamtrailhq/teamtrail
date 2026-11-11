import { BRAND, type AgentSessionDoc, type MapSnapshot } from '@teamtrail/core';
import { readAgentDocs } from '@teamtrail/core/bridge';
import { clipEscaped } from '../blocks';
import type { SlackConfig } from '../store';
import { syncApprovals } from './approvals';
import { syncAsks } from './asks';
import { day } from './constants';
import { digestWindowMs } from './digestWindow';
import { queueLine } from './queueLine';
import { refusedForGood } from './refusedForGood';
import { syncSettingRequests } from './settingRequests';
import type { SlackContext } from './slackContext';
import { trailChanges, notesOf } from './trailChanges';

export function tick(ctx: SlackContext): Promise<void> {
  ctx.ticking ??= runTick(ctx).finally(() => (ctx.ticking = undefined));
  return ctx.ticking;
}

export async function runTick(ctx: SlackContext) {
  const c = ctx.store.read();
  if (ctx.state !== 'online' || !c.owners.length || !ctx.bot) return;
  try {
    const docs = await readAgentDocs(ctx.o.root);
    await syncAsks(ctx, docs, c);
    if (ctx.ticks++ % (ctx.o.trailEvery ?? 5) === 0) await syncTrails(ctx, docs, c);
    await flushBatches(ctx);
  } catch {
    /* Slack or the tracker is unreachable: try again on the next tick */
  }
}

export async function syncTrails(ctx: SlackContext, docs: AgentSessionDoc[], c: SlackConfig) {
  const adapter = await ctx.o.active();
  const ev = new Set(c.notify.events);
  const snaps: MapSnapshot[] = [];
  for (const m of await adapter.listMaps()) {
    const snap = await adapter.loadMap(m.id);
    snaps.push(snap);
    const now = notesOf(snap);
    const prev = ctx.trails.get(m.id);
    ctx.trails.set(m.id, now);
    if (!prev) continue;
    for (const line of trailChanges({ snap, docs, prev, now, events: ev })) queueLine(ctx, m.id, line);
  }
  await syncApprovals(ctx, snaps, c);
  await syncSettingRequests(ctx, snaps, c);
}

/** How much one digest message carries; the rest is in the Lookout. */
const DIGEST_LINES = 15;

function digestText(lines: string[]) {
  const more = lines.length - DIGEST_LINES;
  const shown = lines.slice(0, DIGEST_LINES).map((l) => clipEscaped(l, 300));
  if (more > 0) shown.push(`…and ${more} more in ${BRAND.name}.`);
  return shown.join('\n');
}

/**
 * One digest message per trail per window (the team's digest cadence); later ones thread under that day's first
 * message for the trail. With the digest off, queued lines are dropped: Waiting on you still has everything.
 */
export async function flushBatches(ctx: SlackContext) {
  const now = ctx.o.now?.() ?? Date.now();
  const window = digestWindowMs(ctx.o);
  for (const b of ctx.batches.values()) {
    if (!b.lines.length) continue;
    if (window === undefined) {
      b.lines = [];
      continue;
    }
    if (now - b.lastAt < window) continue;
    const channel = await ctx.target();
    if (!channel) return;
    const text = digestText(b.lines);
    const today = day(now);
    const thread = b.root?.day === today ? b.root.ts : undefined;
    const r = await ctx
      .call<{ ts: string }>('chat.postMessage', { channel, text, ...(thread ? { thread_ts: thread } : {}) })
      .catch((e: unknown) => {
        if (refusedForGood(e)) return undefined; // dropped: the Lookout still has every line
        throw e;
      });
    if (r && !thread) b.root = { day: today, ts: r.ts };
    b.lines = [];
    b.lastAt = now;
  }
}
