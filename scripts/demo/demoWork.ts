/** What the builder writes for each ticket, file by file. */
export type Files = Record<string, string>;

export const FEED: Files = {
  'src/promos/storeRegions.js': `/** How far around a store its promo reaches: the store and its mall entrance. */
export const RADIUS_M = 150;

/** Today's promo geofences: a circle around each store with coordinates; stores without any are skipped. */
export function storeRegions(stores) {
  return stores
    .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
    .map((s) => ({ id: s.id, name: s.name, promo: s.promo, center: { lat: s.lat, lng: s.lng }, radiusM: RADIUS_M }));
}
`,
  'src/promos/storeRegions.test.js': `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { todaysStores } from '../api/promoFeed.js';
import { RADIUS_M, storeRegions } from './storeRegions.js';

test('each store becomes a 150 m circle around its coordinates', () => {
  const [first] = storeRegions(todaysStores());
  assert.deepEqual(first.center, { lat: 52.2299, lng: 21.0028 });
  assert.equal(first.radiusM, RADIUS_M);
  assert.equal(RADIUS_M, 150);
});

test('a store without coordinates is skipped', () => {
  const ids = storeRegions(todaysStores()).map((r) => r.id);
  assert.deepEqual(ids, ['halden-zlote-tarasy', 'halden-arkadia']);
});
`,
};

const toggle = (onAtStart: boolean): Files => ({
  'src/settings/promoSetting.js': `let on = ${onAtStart};
const listeners = new Set();

/** Whether the shopper turned store promos on in Settings. */
export const promosOn = () => on;

/** The Settings switch: turning promos off stops them at once. */
export function setPromos(next) {
  on = next;
  for (const fn of listeners) fn(on);
}

/** Called whenever the switch changes. */
export function onPromosChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
`,
  'src/settings/promoSetting.test.js': `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onPromosChange, promosOn, setPromos } from './promoSetting.js';

test('promos are off until the shopper turns them on', () => {
  assert.equal(promosOn(), false);
});

test('turning promos off stops them at once', () => {
  const seen = [];
  const stop = onPromosChange((on) => seen.push(on));
  setPromos(true);
  setPromos(false);
  stop();
  assert.deepEqual(seen, [true, false]);
  assert.equal(promosOn(), false);
});
`,
});

/** The first try: promos on by default, which the tests catch. */
export const TOGGLE_FIRST = toggle(true);
export const TOGGLE_FIXED = toggle(false);

/** The notification, with the daily limit the trail lead chose and the location access they decided on. */
export function notifyFiles(o: { perDay: number; always: boolean }): Files {
  const permission = o.always ? 'requestBackgroundPermissionsAsync' : 'requestForegroundPermissionsAsync';
  return {
    'src/promos/promoOnEnter.js': `import { promosOn } from '../settings/promoSetting.js';

/** At most this many promos per store per day, as the trail lead decided. */
export const PER_STORE_PER_DAY = ${o.perDay};

/** The promo to send on entering a store's geofence, or null: promos off, or the store's daily limit reached. */
export function promoOnEnter(region, sent, now) {
  if (!promosOn()) return null;
  const key = \`\${region.id}:\${new Date(now).toISOString().slice(0, 10)}\`;
  const count = sent.get(key) ?? 0;
  if (count >= PER_STORE_PER_DAY) return null;
  sent.set(key, count + 1);
  return { title: region.name, body: region.promo };
}
`,
    'src/promos/promoOnEnter.test.js': `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setPromos } from '../settings/promoSetting.js';
import { PER_STORE_PER_DAY, promoOnEnter } from './promoOnEnter.js';

const store = { id: 'halden-arkadia', name: 'Halden Arkadia', promo: 'Second jacket half price' };
const noon = Date.parse('2026-11-27T12:00:00Z');

test("entering a store's geofence sends that store's promo", () => {
  setPromos(true);
  assert.deepEqual(promoOnEnter(store, new Map(), noon), { title: 'Halden Arkadia', body: 'Second jacket half price' });
});

test('a shopper gets at most the agreed number of promos per store per day', () => {
  setPromos(true);
  const sent = new Map();
  for (let i = 0; i < PER_STORE_PER_DAY; i++) assert.ok(promoOnEnter(store, sent, noon + i));
  assert.equal(promoOnEnter(store, sent, noon + 60_000), null);
  assert.ok(promoOnEnter(store, sent, noon + 86_400_000), 'a new day');
});

test('nothing is sent while promos are off', () => {
  setPromos(false);
  assert.equal(promoOnEnter(store, new Map(), noon), null);
});
`,
    'src/promos/startGeofencing.js': `import * as Location from 'expo-location';
import { todaysStores } from '../api/promoFeed.js';
import { storeRegions } from './storeRegions.js';

export const PROMO_TASK = 'halden-store-promos';

/** Asks for location access (${o.always ? "'Always', so promos arrive in the background" : "'While using', so promos arrive with the app open"}) and watches today's stores. */
export async function startGeofencing() {
  const { granted } = await Location.${permission}();
  if (!granted) return false;
  const regions = storeRegions(todaysStores()).map((r) => ({ identifier: r.id, latitude: r.center.lat, longitude: r.center.lng, radius: r.radiusM }));
  await Location.startGeofencingAsync(PROMO_TASK, regions);
  return true;
}
`,
  };
}
