import type { Need } from '../model/repoProfile';

/** Test dependencies that drive a browser, by package name across ecosystems. */
const BROWSER = [
  'karma',
  'playwright',
  '@playwright/test',
  'puppeteer',
  'cypress',
  'selenium-webdriver',
  'webdriverio',
  '@wdio/cli',
  'testcafe',
  'nightwatch',
  'pytest-playwright',
  'selenium',
  'splinter',
  'cuprite',
  'laravel/dusk',
  'symfony/panther',
  'org.seleniumhq.selenium',
  'com.microsoft.playwright',
  'github.com/chromedp/chromedp',
  'github.com/playwright-community/playwright-go',
  'thirtyfour',
  'fantoccini',
  'headless_chrome',
];

/** Testcontainers in any of its spellings: tests that start Docker containers. */
const DOCKER = /^(@testcontainers\/.+|testcontainers(-.+)?|org\.testcontainers(:.+)?|github\.com\/testcontainers\/.+)$/;

/** What a unit's dependencies say its tests need: a browser, or Docker for Testcontainers. One need per kind. */
export function depNeeds(o: { deps: Iterable<string>; file: string }): Need[] {
  const deps = [...o.deps];
  const out: Need[] = [];
  const browser = deps.find((d) => BROWSER.includes(d));
  if (browser) out.push({ kind: 'browser', name: browser, why: `${browser} in ${o.file}` });
  const docker = deps.find((d) => DOCKER.test(d));
  if (docker) out.push({ kind: 'service', name: 'docker', why: `${docker} (Testcontainers) in ${o.file}` });
  return out;
}
