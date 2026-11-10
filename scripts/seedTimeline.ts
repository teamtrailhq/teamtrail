// A lived-in day for the dev seed: the trails were charted hours ago, not at seed time, the finished trail ended days
// ago, and the main trail's finished tickets carry the claims that led to them. The trail clock, the Logbook, Trail
// stats and the model matching hints then read like real use (and so do the landing site's screenshots, which are
// taken on this seed). Run last: it dates what the other steps wrote.
import fs from 'node:fs';
import path from 'node:path';
import type { MapDoc, TrackerAdapter, TransitionEntry } from '@teamtrail/core';
import { journalFile } from '@teamtrail/core/agents';

const MIN = 60_000;

/**
 * How long ago each trail was charted, in minutes: the main one yesterday afternoon (its sample decisions date from
 * then, see sampleSnapshot), the plan-only one the day before.
 */
const CHARTED_MIN_AGO = { main: 20 * 60 + 12, second: 46 * 60 };

/** When the finished trail (seedHistory) ended, and how long it ran. */
export const HISTORY_FINISHED_MIN_AGO = 3 * 24 * 60;
const HISTORY_RAN_MIN = 2 * 24 * 60;

/** Minutes from first claim to done for the main trail's finished tickets, by type, used in turn. */
const LEAD_MIN: Record<string, number[]> = {
  research: [42, 55, 37],
  junction: [24, 31],
  prototype: [68],
  task: [29, 22],
  execute: [51, 64],
};

interface SeedInput {
  root: string;
  adapter: TrackerAdapter;
  main: MapDoc;
  second: MapDoc;
  history: MapDoc;
  now: number;
}

export async function seedTimeline({ root, adapter, main, second, history, now }: SeedInput) {
  const charted = now - CHARTED_MIN_AGO.main * MIN;
  backdate(path.join(root, main.id, 'map.md'), { created: charted });
  closeWhenDecided({ root, mapId: main.id, charted });
  backdate(path.join(root, second.id, 'map.md'), { created: now - CHARTED_MIN_AGO.second * MIN });
  const ended = now - HISTORY_FINISHED_MIN_AGO * MIN;
  const started = ended - HISTORY_RAN_MIN * MIN;
  backdate(path.join(root, history.id, 'map.md'), { created: started, updated: ended });
  const tickets = path.join(root, history.id, 'tickets');
  for (const f of fs.readdirSync(tickets))
    backdate(path.join(tickets, f), { created: started, updated: ended, closed: ended });
  await journalFinishedWork({ root, adapter, main, now });
}

/**
 * The main trail's tickets were created and closed at seed time, while their decisions date from the trail's first
 * hours (sampleSnapshot). Each ticket is dated from the charting, and a closed one closes when its last decision was
 * made, so the map, the Logbook and Trail stats tell the same story.
 */
function closeWhenDecided({ root, mapId, charted }: { root: string; mapId: string; charted: number }) {
  const decided = new Map<string, number>();
  const dir = path.join(root, mapId, 'decisions');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const id = text.match(/^ticket: "?([^"\n]+)"?$/m)?.[1];
    const at = Date.parse(text.match(/^decided_at: (.+)$/m)?.[1] ?? '');
    if (id && at) decided.set(id, Math.max(decided.get(id) ?? 0, at));
  }
  const tickets = path.join(root, mapId, 'tickets');
  for (const f of fs.readdirSync(tickets)) {
    const at = decided.get(f.replace(/\.md$/, ''));
    const times: Record<string, number> = { created: charted + 10 * MIN };
    if (at) Object.assign(times, { updated: at, closed: at });
    backdate(path.join(tickets, f), times);
  }
}

/** Rewrites the timestamps in a tracker file's frontmatter (`created` is what the trail clock counts from). */
function backdate(file: string, times: Record<string, number>) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [field, at] of Object.entries(times))
    text = text.replace(new RegExp(`^${field}: .*$`, 'm'), `${field}: ${new Date(at).toISOString()}`);
  fs.writeFileSync(file, text);
}

/** A claim for every ticket the seed closed as done, dated before it closed so the work took a believable time. */
async function journalFinishedWork({ root, adapter, main, now }: Omit<SeedInput, 'second' | 'history'>) {
  const journal = journalFile(root);
  const used: Record<string, number> = {};
  const done = (await adapter.loadMap(main.id)).tickets.filter(
    (t) => t.state === 'closed' && t.closeReason !== 'not_planned',
  );
  for (const t of done) {
    const leads = LEAD_MIN[t.type] ?? [40];
    const i = used[t.type] ?? 0;
    used[t.type] = i + 1;
    const entry: TransitionEntry = {
      v: 1,
      kind: 'transition',
      at: (t.closedAt ?? now) - leads[i % leads.length] * MIN,
      mapId: main.id,
      ticketId: t.id,
      ticketKey: t.key,
      event: 'claim',
      from: 'ready',
      to: 'working',
      actor: t.assignee ?? 'claude-01',
      actorKind: 'agent',
    };
    journal.append(entry);
  }
}
