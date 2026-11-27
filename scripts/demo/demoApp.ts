import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** The demo's committer, for the starting commit and the agents' work. */
export const DEMO_GIT = ['-c', 'user.name=Aisle team', '-c', 'user.email=team@aisle.invalid'];

const PACKAGE = {
  name: 'aisle',
  private: true,
  version: '1.4.0',
  description: 'Aisle: the Halden shopping app (React Native).',
  scripts: { test: 'node --test', lint: 'node scripts/lint.mjs' },
};

const FILES: Record<string, string> = {
  'README.md': `# Aisle

The Halden shopping app: browse the catalogue, save looks, find the nearest store.

- \`App.js\`: the app's screens
- \`src/api/promoFeed.js\`: today's promos and the stores they run in, from the promo team's feed
- \`src/geo/distance.js\`: distance between two points on the map

\`npm test\` runs the unit tests, \`npm run lint\` the lint.
`,
  'App.js': `import { NavigationContainer } from '@react-navigation/native';
import { CatalogueScreen } from './src/screens/CatalogueScreen';
import { StoresScreen } from './src/screens/StoresScreen';

/** Aisle: the catalogue and the store finder. */
export default function App() {
  return (
    <NavigationContainer>
      <CatalogueScreen />
      <StoresScreen />
    </NavigationContainer>
  );
}
`,
  'src/api/promoFeed.js': `/** Today's promos from the promo team's feed: each store with its coordinates and its promo, when it has one. */
export function todaysStores() {
  return [
    { id: 'halden-zlote-tarasy', name: 'Halden Złote Tarasy', lat: 52.2299, lng: 21.0028, promo: '20% off denim today' },
    { id: 'halden-arkadia', name: 'Halden Arkadia', lat: 52.2567, lng: 20.9843, promo: 'Second jacket half price' },
    { id: 'halden-online', name: 'Halden Online', promo: 'Free returns this week' },
  ];
}
`,
  'src/geo/distance.js': `const EARTH_M = 6_371_000;
const rad = (d) => (d * Math.PI) / 180;

/** Metres between two points on the map (haversine). */
export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}
`,
  'src/geo/distance.test.js': `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceM } from './distance.js';

test('the same point is 0 m away', () => {
  assert.equal(distanceM({ lat: 52.23, lng: 21 }, { lat: 52.23, lng: 21 }), 0);
});

test('Złote Tarasy to Arkadia is about 3.3 km', () => {
  const m = distanceM({ lat: 52.2299, lng: 21.0028 }, { lat: 52.2567, lng: 20.9843 });
  assert.ok(m > 3_100 && m < 3_500, String(m));
});
`,
  'scripts/lint.mjs': `// The lint: no console.log or debugger left in src/.
import fs from 'node:fs';
import path from 'node:path';

const found = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\\.js$/.test(e.name) && /console\\.log|debugger/.test(fs.readFileSync(p, 'utf8'))) found.push(p);
  }
};
walk('src');
if (found.length) {
  console.error(\`console.log or debugger left in:\\n\${found.join('\\n')}\`);
  process.exit(1);
}
console.log('lint: ok');
`,
  '.teamtrail/verification.json': `${JSON.stringify(
    {
      v: 1,
      default: 'checks',
      checks: {
        test: { run: ['npm', 'test'], timeoutSec: 120 },
        lint: { run: ['npm', 'run', 'lint'], timeoutSec: 60 },
      },
      run: ['test', 'lint'],
    },
    null,
    2,
  )}\n`,
};

/** The app as the team has it before the trail: a small React Native app with tests and a lint, one commit on main. */
export function writeDemoApp(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(PACKAGE, null, 2)}\n`);
  for (const [file, text] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  const git = (...a: string[]) => execFileSync('git', [...DEMO_GIT, ...a], { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'Aisle 1.4: catalogue and store finder');
}
