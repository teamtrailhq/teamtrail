import type { Call } from './demoChart';

const TITLES = {
  feed: 'Store geofences from the promo feed',
  permission: 'Background location: Always, or only while the app is open?',
  toggle: 'Promo notifications switch in Settings',
  notify: "Notify when a shopper enters a store's geofence",
} as const;

/** Every `{ key, title }` anywhere in a tool's result. */
function pairs(v: unknown, out: { key: string; title: string }[] = []) {
  if (Array.isArray(v)) for (const x of v) pairs(x, out);
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.key === 'string' && typeof o.title === 'string') out.push({ key: o.key, title: o.title });
    for (const x of Object.values(o)) pairs(x, out);
  }
  return out;
}

/** The demo trail's tickets by role, read from the trail as the agent sees it. */
export async function ticketKeys(call: Call) {
  const found = pairs(await call('resume_trail', { trail: '#1' }));
  const key = (title: string) => {
    const k = found.find((p) => p.title === title)?.key;
    if (!k) throw new Error(`no ticket "${title}" on #1: run npm run demo again`);
    return k;
  };
  return {
    feed: key(TITLES.feed),
    permission: key(TITLES.permission),
    toggle: key(TITLES.toggle),
    notify: key(TITLES.notify),
  };
}
