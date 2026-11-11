// Builds nothing; run `npm run build` first. Serves dist/ and writes PNG captures, the animated banner GIF and an MP4 demo loop.
// Usage: OUT_DIR=captures CHROME=/path/to/chrome [WORDMARK='teamtrail'] node tools/capture.mjs
// WORDMARK overrides the wordmark; the default is WORDMARK in preview/content.ts.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const font = (f) => createRequire(import.meta.url).resolve(`@fontsource-variable/${f}`);
const WORDMARK =
  process.env.WORDMARK ||
  readFileSync(new URL('../preview/content.ts', import.meta.url), 'utf8').match(
    /^export const WORDMARK = '(.+)';$/m,
  )[1];
const wm = `&wordmark=${encodeURIComponent(WORDMARK)}`;
const OUT = resolve(process.env.OUT_DIR || 'captures');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 4174, strictPort: true } });
const base = 'http://localhost:4174/';
const browser = await chromium.launch({ executablePath: CHROME });

async function still(view, file, extra = '') {
  const page = await browser.newPage({ viewport: { width: 1700, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}?view=${view}${extra}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.locator(`[data-capture="${view}"]`).screenshot({ path: join(OUT, file) });
  await page.close();
  console.log('wrote', join(OUT, file));
}

await still('options', 'scout-avatar-options.png');
await still('states', 'scout-avatar-states.png');

// Brand / social kit: exact pixel sizes at deviceScaleFactor 1 so the sprite stays nearest-neighbor crisp.
const BRAND = join(OUT, 'brand');
mkdirSync(BRAND, { recursive: true });
const KIT = [
  ['github-org-avatar.png', 'GitHub org avatar', 1000, 1000, 'square', '&n=1000'],
  ['github-org-avatar-wordmark.png', 'GitHub org avatar, wordmark', 1000, 1000, 'square', '&n=1000&who=wordmark'],
  ['github-social-preview.png', 'GitHub repo social preview', 1280, 640, 'banner', '&w=1280&h=640'],
  ['og-image-1200x630.png', 'Open Graph · teamtrail.app', 1200, 630, 'banner', '&w=1200&h=630'],
  ['x-header-1500x500.png', 'X header', 1500, 500, 'banner', '&w=1500&h=500&layout=header'],
  ['wordmark-lockup.png', 'Logo lockup', 960, 240, 'lockup', '&w=960&h=240'],
  ['wordmark-lockup-light.png', 'Logo lockup, light', 960, 240, 'lockup', '&w=960&h=240&light=1'],
  ['x-avatar-400.png', 'X avatar', 400, 400, 'square', '&n=400'],
  ['slack-icon-512.png', 'Slack app icon (Scout)', 512, 512, 'square', '&n=512&who=scout'],
  ['scout-badge-1000.png', 'Scout badge', 1000, 1000, 'square', '&n=1000&who=scout'],
  ['linkedin-discord-avatar-512.png', 'LinkedIn / Discord avatar', 512, 512, 'square', '&n=512'],
  ['logo-light-512.png', 'Logo, light version', 512, 512, 'square', '&n=512&theme=light'],
  ['favicon-64.png', 'Favicon 64 (light tabs)', 64, 64, 'favicon', '&px=64'],
  ['favicon-32.png', 'Favicon 32 (light tabs)', 32, 32, 'favicon', '&px=32'],
  ['favicon-64-dark.png', 'Favicon 64 (dark tabs)', 64, 64, 'favicon', '&px=64&theme=dark'],
  ['favicon-32-dark.png', 'Favicon 32 (dark tabs)', 32, 32, 'favicon', '&px=32&theme=dark'],
];
for (const [file, , w, h, view, extra] of KIT) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`${base}?view=${view}${extra}${view === 'banner' || view === 'lockup' ? wm : ''}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  if (view === 'favicon')
    await page.addStyleTag({ content: 'html, body, #root { background: transparent !important; }' });
  await page
    .locator(`[data-capture="${view}"]`)
    .screenshot({ path: join(BRAND, file), omitBackground: view === 'favicon' });
  await page.close();
  console.log('wrote', join(BRAND, file));
}

// Contact sheet: every asset, plus small-size checks (downsampled, then shown 1x and zoomed nearest-neighbor).
{
  const img = (f) => 'data:image/png;base64,' + readFileSync(join(BRAND, f)).toString('base64');
  const tiles = KIT.map(([f, label, w, h]) => {
    const scale = Math.min(1, 560 / w, 300 / h);
    return `<figure><img src="${img(f)}" style="width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px;${scale >= 1 ? 'image-rendering:pixelated;' : ''}"><figcaption><b>${label}</b> ${w}×${h}<br><span>brand/${f}</span></figcaption></figure>`;
  }).join('');
  const checks = [
    ['slack-icon-512.png', 32, 'Slack 32px'],
    ['github-org-avatar.png', 40, 'GitHub 40px'],
    ['x-avatar-400.png', 48, 'X 48px'],
    ['favicon-32.png', 32, 'Favicon 32px'],
    ['favicon-64.png', 16, 'Tab 16px'],
  ]
    .map(
      ([f, px, label]) =>
        `<figure class="chk"><canvas data-src="${img(f)}" data-px="${px}"></canvas><figcaption><b>${label}</b> 1× and 4× zoom</figcaption></figure>`,
    )
    .join('');
  const page = await browser.newPage({ viewport: { width: 1840, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>
    @font-face{font-family:B;src:url(${'data:font/woff2;base64,' + readFileSync(font('figtree/files/figtree-latin-wght-normal.woff2')).toString('base64')})}
    @font-face{font-family:M;src:url(${'data:font/woff2;base64,' + readFileSync(font('jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2')).toString('base64')})}
    @font-face{font-family:C;font-weight:700;src:url(${'data:font/woff2;base64,' + readFileSync(createRequire(import.meta.url).resolve('@fontsource/londrina-solid/files/londrina-solid-latin-900-normal.woff2')).toString('base64')})}
    body{margin:0;background:#101815;color:#c3cdc1;font:13px B}
    #s{display:inline-block;padding:28px 32px}
    h1{margin:0 0 18px;font:700 20px C;color:#eef0e4} h1 span{font:13px M;letter-spacing:.1em;color:#93a497}
    .g{display:flex;flex-wrap:wrap;gap:22px;width:1776px;align-items:flex-end}
    figure{margin:0;display:flex;flex-direction:column;gap:6px} img{display:block;border:1px solid rgba(150,170,155,.2)}
    figcaption{font:12px M;color:#93a497} figcaption b{color:#eef0e4;font-weight:400}
    h2{font:13px M;letter-spacing:.1em;color:#eef0e4;margin:26px 0 12px;text-transform:uppercase}
    canvas{display:block} .row{display:flex;gap:30px;align-items:flex-end}
  </style><div id="s"><h1>${WORDMARK} <span>Social kit</span></h1><div class="g">${tiles}</div><h2>Small-size checks</h2><div class="row">${checks}</div></div>`);
  await page.evaluate(async () => {
    for (const c of document.querySelectorAll('canvas')) {
      const px = +c.dataset.px;
      const im = new Image();
      im.src = c.dataset.src;
      await im.decode();
      const small = document.createElement('canvas');
      small.width = small.height = px;
      const sx = small.getContext('2d');
      sx.imageSmoothingQuality = 'high';
      sx.drawImage(im, 0, 0, px, px);
      c.width = px * 5 + 16;
      c.height = px * 4;
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(small, 0, px * 3);
      cx.drawImage(small, px + 16, 0, px * 4, px * 4);
    }
  });
  await page.locator('#s').screenshot({ path: join(BRAND, 'social-kit-overview.png') });
  await page.close();
  console.log('wrote', join(BRAND, 'social-kit-overview.png'));
}

// Animated README banner: BANNER_LOOP rendered frame by frame at the speech step (frozen clock, so timing is exact),
// identical neighbours merged, then one shared palette with no dithering so the sprite stays hard-edged.
{
  const STEP = 120;
  const gifTmp = join(OUT, '.gif-tmp');
  rmSync(gifTmp, { recursive: true, force: true });
  mkdirSync(gifTmp, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?view=banner&loop=1&w=1280&h=640${wm}`);
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__bannerSteps);
  const steps = await page.evaluate(() => window.__bannerSteps);
  const banner = page.locator('[data-capture="banner"]');
  const frames = [];
  for (const [i, ms] of steps.entries()) {
    for (let at = 0; at < ms; at += STEP) {
      await page.evaluate(([i, at]) => window.__bannerFrame(i, at), [i, at]);
      await page.waitForSelector(`[data-frame="${i}:${at}"]`);
      const png = await banner.screenshot();
      const last = frames.at(-1);
      if (last && last.png.equals(png)) last.ms += STEP;
      else frames.push({ png, ms: STEP });
    }
  }
  await page.close();
  const list = frames.map((f, k) => {
    const file = join(gifTmp, `f${String(k).padStart(4, '0')}.png`);
    writeFileSync(file, f.png);
    return `file '${file}'\nduration ${f.ms / 1000}`;
  });
  // The concat demuxer ignores the last entry's duration unless the file is listed once more.
  writeFileSync(
    join(gifTmp, 'list.txt'),
    `${list.join('\n')}\nfile '${join(gifTmp, `f${String(frames.length - 1).padStart(4, '0')}.png`)}'\n`,
  );
  const gif = join(BRAND, 'teamtrail-banner.gif');
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    join(gifTmp, 'list.txt'),
    '-filter_complex',
    'scale=960:480:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
    '-fps_mode',
    'vfr',
    '-loop',
    '0',
    gif,
  ]);
  // GitHub's social preview takes a GIF under 1 MB; 640×320 is the smallest size it recommends.
  execFileSync('ffmpeg', [
    ...['-y', '-loglevel', 'error', '-i', gif, '-filter_complex'],
    'scale=640:320:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
    ...['-fps_mode', 'vfr', '-loop', '0', join(BRAND, 'github-social-preview.gif')],
  ]);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    join(gifTmp, 'list.txt'),
    ...['-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', '-an'],
    join(BRAND, 'teamtrail-social-loop.mp4'),
  ]);
  rmSync(gifTmp, { recursive: true, force: true });
  console.log('wrote', gif, `(${frames.length} frames, ${steps.reduce((a, b) => a + b, 0) / 1000}s)`);
}

// Demo: record one full script loop, then trim the page-load lead-in.
const tmp = join(OUT, '.video-tmp');
rmSync(tmp, { recursive: true, force: true });
const size = { width: 1280, height: 620 };
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: tmp, size } });
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(`${base}?view=demo`);
// Recorded video ignores deviceScaleFactor, so zoom the page instead to keep the glyphs crisp.
await page.addStyleTag({ content: 'body { zoom: 1.4; }' });
await page.evaluate(() => document.fonts.ready);
const start = (Date.now() - t0) / 1000;
await page.waitForSelector('[data-capture="demo"][data-loop="1"]', { timeout: 60000 });
const end = (Date.now() - t0) / 1000;
await ctx.close();
const webm = join(
  tmp,
  readdirSync(tmp).find((f) => f.endsWith('.webm')),
);
const mp4 = join(OUT, 'scout-avatar-demo.mp4');
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-ss',
  String(start + 0.2),
  '-to',
  String(end),
  '-i',
  webm,
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '20',
  '-movflags',
  '+faststart',
  mp4 + '.tmp.mp4',
]);
renameSync(mp4 + '.tmp.mp4', mp4);
rmSync(tmp, { recursive: true, force: true });
console.log('wrote', mp4, `(${(end - start).toFixed(1)}s)`);

await browser.close();
await new Promise((r) => server.httpServer.close(r));
