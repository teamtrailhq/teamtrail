import { checklistOf } from './checklistOf';

/** One MCP tool call, its JSON result (free-form, as an agent reads it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are untyped JSON
export type Call = (name: string, args?: Record<string, unknown>) => Promise<any>;

const unit = (text: string) => ({ text, kind: 'unit' });

/** The trail as the charting agent frames it: where it leads and the tickets that get there, criteria agreed first. */
const TRAIL = {
  title: 'Store promos by geofence',
  destination:
    "When a shopper with promos turned on walks into a Halden store's area, Aisle tells them about that store's promo of the day. Never more than they asked for, and never without their consent.",
  notes:
    "The promo team wants in-store traffic on promo days. Shoppers already use the store finder, so they know Aisle knows where the stores are. A nudge is welcome; feeling tracked isn't.",
  unspecified: ['Promos for stores that open later in the year'],
  outOfScope: ['Promos by email', 'Tracking where shoppers go between stores'],
  tickets: [
    {
      ref: 'feed',
      title: 'Store geofences from the promo feed',
      type: 'task',
      body: "Turn today's promo feed into geofences: a 150 m circle around each store that has coordinates.",
      criteria: [
        unit('Each store becomes a 150 m circle around its coordinates'),
        unit('A store without coordinates is skipped'),
      ],
    },
    {
      ref: 'permission',
      title: 'Background location: Always, or only while the app is open?',
      type: 'junction',
      body: "Geofences only fire in the background with 'Always' location access. 'While using' is easier to grant but only works with the app open.",
    },
    {
      ref: 'toggle',
      title: 'Promo notifications switch in Settings',
      type: 'task',
      body: 'A switch in Settings that turns store promos on and off.',
      criteria: [unit('Promos are off until the shopper turns them on'), unit('Turning promos off stops them at once')],
    },
    {
      ref: 'notify',
      title: "Notify when a shopper enters a store's geofence",
      type: 'task',
      body: "On entering a store's geofence, send that store's promo as a local notification.",
      blockedBy: ['feed', 'permission', 'toggle'],
      criteria: [
        unit("Entering a store's geofence sends that store's promo"),
        unit('A shopper gets at most the agreed number of promos per store per day'),
        unit('Nothing is sent while promos are off'),
      ],
    },
  ],
};

const BRIEF = {
  summary:
    "Add store promos to Aisle: geofences around Halden stores from the promo feed, a local notification with the store's promo on entering one, and a Settings switch so it only happens for shoppers who opted in.",
  productContext:
    'Promo days drive in-store visits. Shoppers trust Aisle with their location for the store finder; a promo they asked for keeps that trust, an unexpected one loses it.',
  existing:
    "- `src/api/promoFeed.js`: today's stores with coordinates and their promo (Halden Online has no coordinates)\n- `src/geo/distance.js`: haversine distance, tested\n- `App.js`: the catalogue and store finder screens\n- No notifications and no background location yet",
  conventions: 'Logic lives in plain modules under `src/` with a `.test.js` next to each; screens only call them.',
  dataModel: 'A per-store record of the last promo sent, on the device. Nothing leaves the phone.',
  api: 'None: the promo feed already has what we need.',
  risks:
    'Background location is a sensitive permission: asking too early gets it denied for good. Too many notifications and shoppers turn them all off. Battery use if geofences are too many or too small.',
  assumptions: [
    'The promo feed lists every store with coordinates',
    'A 150 m radius covers a store and its mall entrance',
  ],
  openQuestions: ["Background location: 'Always' or 'While using the app'?", 'How many promos per store per day?'],
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The charting agent, as a real one would go: it starts the trail with its tickets and criteria, claims the
 * discovery ticket, reads the app, submits the brief and closes discovery. The plan then waits for the trail lead.
 */
export async function chartDemoTrail(call: Call) {
  const started = await call('start_trail', TRAIL);
  const discovery = (started.trail?.tickets ?? started.tickets ?? []).find(
    (t: { type: string }) => t.type === 'research',
  );
  const claimed = await call('claim_ticket', {
    trail: started.trail.key,
    ...(discovery ? { ticket: discovery.key } : {}),
  });
  const trail = started.trail.key;
  await call('report_progress', {
    trail,
    step: 'Investigate',
    message: 'Reading the promo feed, the store finder and the geo code',
  });
  await pause(300);
  await call('submit_brief', { trail, ...BRIEF });
  await call('close_ticket', {
    trail,
    ticket: claimed.claimed.key,
    resolution: 'Brief submitted: the plan is four tickets, with two questions for the trail lead.',
    noCodeReason: 'Discovery only: read the code and wrote the brief.',
    ...checklistOf(claimed.claimed),
  });
  return { trail, title: TRAIL.title };
}
