# Teamtrail logo and Scout badge

Two marks, one drawing style:

- **The Teamtrail logo** (`src/logo/`): a lowercase t whose stem curves into a path that runs to its destination, an orange dot, on a tile. Two versions: `dark` for dark backgrounds (dark tile, light moss; the default) and `light` for light ones (pale tile, deep moss), with the colours in `logoColors.ts`. `<Logo theme="auto">` follows the page's `color-scheme`. Favicons use it without the tile (`bare`); `logoFaviconSvg()` is one SVG that switches with `prefers-color-scheme`. Nav, favicon, npm, GitHub and social images use it.
- **Scout** (`src/scout/`): the voice of Teamtrail wherever you meet it, in the Lookout, Slack, the site, docs and the product video. An AI scout companion looking to the side, drawn as a bust on a moss ground: a screen face, a cap, a headset with a mic, an antenna lamp and a neckerchief (`badgeArt.ts`, `shape`: a circle in the app, a full square for Slack). Guides are symbol badges in a circle (`guideArt.ts`): magnifier, check, shield, book, compass, and a grey plus for Community.

**Which mark where**

- **Square or squarish spaces** (avatars, favicons, app icons, the Slack, GitHub and X avatars): the `t.` logo, as the tile or the bare mark.
- **Spaces wider than tall** (banners, social previews, headers, lockups, the Lookout's sign-in and onboarding): the `teamtrail.` wordmark, lowercase in Londrina Solid 900 with the orange dot.
- Never both side by side. "Teamtrail" stays the name in running text and accessibility labels.

`ScoutAvatar` and `mountScout` draw the same badge from `badgeArt.ts`.

- **Renderings:** `crt` (day) and `night` (the cap lamp burns bright).
- **Small sizes:** `xs` and anything under about 28px use the simple drawing, without the fine detail.
- **States:**
  - `idle`: flat bar eyes and a small mouth, with the cap lamp on. Blinks every ~5.6s.
  - `speaking`: the mouth follows the text, and a waveform shows only while Scout talks.
  - `thinking`: the eyes and mouth shift aside, and the cap lamp pulses.
  - `alert`: wide eyes and a red cap lamp.

## Files

```
src/logo/
  logoShapes.ts    the mark's geometry
  logoColors.ts    the light and dark versions' colours
  logoMark.ts      the logo's SVG markup, with and without the tile, per theme
  logoFaviconSvg.ts  a standalone favicon SVG that follows prefers-color-scheme
  logoAutoStyle.ts the light-dark() colours behind theme="auto"
  Logo.tsx         React component (size, bare, theme)
src/scout/
  badgeArt.ts      Scout's badge: colours, faces and SVG markup
  guideArt.ts      guide symbol badges
  Badge.tsx        React component for a still badge at any size
  frames.ts        styles (day/night), expressions per state, status labels, timing, visemes, composeWave
  types.ts         shared types
  scoutFrame.ts    what Scout shows at a moment (state, face, layout, labels), shared by both renderers
  rects.ts         waveform rects
  ScoutAvatar.tsx  React component; Wave.tsx and hooks/ (reduced motion, clock, blink)
  mountScout.ts    framework-free renderer with the same markup, classes and timing (for the vanilla landing page)
  ScoutAvatar.css  panel frame; all colors are --scout-* vars with lookout fallbacks
  index.ts         React exports (import mountScout from './mountScout' directly)
preview/           preview page (?view=options | states | demo | square | favicon | lockup | banner, &theme=light|dark for square and favicon); App.tsx
tools/
  capture.mjs      writes the PNGs, the banner GIF, the MP4 loop and brand/* (Playwright + system Chrome)
```

## Lookout

The Lookout imports the component from `@teamtrail/scout-avatar`.

It reads the lookout tokens, so it follows the active fonts and palette:

- `--mono`, `--display`, `--sans`
- `--urgent`
- `--line`, `--line2`, `--panel`

`Inbox.tsx` → `Conversation` renders a `sm` panel at the top of the conversation pane, next to the ticket title:

```tsx
<ScoutAvatar size="sm" state={pending ? 'alert' : 'idle'} />
```

There is no onboarding placement. The activity log keeps `ScoutMark`.

## Landing page

The landing page imports the framework-free renderer from `@teamtrail/scout-avatar/mount`. It does not use React.

The "Meet Scout" section (`#scout`) mounts an `lg` panel:

- It plays its `data-scout-line` once when the section scrolls into view, then holds the caption with the status back at `ONLINE`.
- Below 400px wide it uses `md`.

```ts
const scout = mountScout(host, { size: 'lg', caption: true });
scout.update({ speaking: "I keep your trail moving. When a call is yours, I'll ask you." });
scout.destroy();
```

`--scout-warn`, `--scout-line`, `--scout-line2` and `--scout-panel` are mapped to the landing tokens on `.meet__avatar .scout`.

## API

| Prop         | Default              | Notes                                                                                                                                                                            |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`      | `'idle'`             | `idle` \| `speaking` \| `thinking` \| `alert`                                                                                                                                    |
| `size`       | `'md'`               | `xs` is the simple badge at 32px. `sm` is 80px, `md` 160px and `lg` 240px. A number sets the size in units of 40px.                                                              |
| `speaking`   | none                 | A non-empty string switches `idle`/`speaking` to speaking. `alert` and `thinking` keep priority. Once the line has played, the caption stays and the status returns to `ONLINE`. |
| `variant`    | `'crt'`              | `crt` \| `night`                                                                                                                                                                 |
| `framed`     | `true` (except `xs`) | HUD panel with the `Scout // ONLINE` label.                                                                                                                                      |
| `caption`    | `true` for md/lg     | Shows the spoken line under the waveform.                                                                                                                                        |
| `label`      | `'Scout'`            | Panel name and accessible name.                                                                                                                                                  |
| `onSpeakEnd` | none                 | Fires about 350ms after the line has played. It also fires under reduced motion.                                                                                                 |
| `at`         | none                 | Freezes the clock at N ms. Used for screenshots and tests.                                                                                                                       |

`mountScout(host, options)` takes the same options except `at`, `className` and `style`. It returns `{ update(partial), destroy() }`.

## Motion rules

- Motion happens only on state changes or ongoing states. There's no ambient or decorative animation. The allowed motion is:
  - the blink (framed panels, idle and speaking only)
  - the mouth and waveform while a line plays
  - the thinking status-light pulse (520ms step)
  - a two-pulse ring when `alert` begins
- With `prefers-reduced-motion: reduce`, and always at `xs`, nothing animates:
  - Speaking shows one static mouth frame, a static waveform and the full caption. It still calls `onSpeakEnd` after the same duration.
  - Thinking holds the light dim.
  - The alert pulse is off.
- Timers run only while something is animating. Re-renders are capped at 25/s while speaking.
- Screen readers get `role="img"` with "Scout, online / transmitting / processing / decision waiting", plus the full line once via `aria-live="polite"`.

## Colours and changing the art

All colours and shapes are in `badgeArt.ts`, `logoShapes.ts` and `logoColors.ts`. After changing them, re-run the capture and copy the results where they are used: the Lookout's favicon (`apps/lookout/index.html`, pinned by `apps/lookout/test/favicon.test.ts`) and the landing site's `public/media/brand/` (see below).

## Preview, captures and brand kit

```
npm install
npm run dev                  # playground at http://localhost:5173 (+ ?view=options|states|demo)
npm run build
npm run capture              # needs Chrome (CHROME=...) and ffmpeg
```

`capture` also renders `brand/` at exact sizes:

- `github-org-avatar.png` (1000², the logo tile) and `github-org-avatar-wordmark.png` (1000², the wordmark on a dark square)
- `github-social-preview.png` (1280×640) and `github-social-preview.gif` (640×320, animated, under GitHub's 1 MB limit)
- `teamtrail-banner.gif` (960×480): the README banner, the `teamtrail.` wordmark while the trail walks to its destination, one `BANNER_LOOP` pass (preview/content.ts) rendered frame by frame with a frozen clock
- `og-image-1200x630.png`
- `x-header-1500x500.png`
- `wordmark-lockup.png`, `wordmark-lockup-light.png`: the `teamtrail.` wordmark alone, on dark and on light
- `x-avatar-400.png`
- `slack-icon-512.png`
- `linkedin-discord-avatar-512.png`
- `logo-light-512.png`: the light version on a light background
- `favicon-64.png`, `favicon-32.png` (the bare mark, light version) and `favicon-64-dark.png`, `favicon-32-dark.png`
- `social-kit-overview.png`: a contact sheet with checks at 16 to 48px

The banner copy is agent-agnostic. The brand views are `?view=square&n=&who=logo|wordmark|scout&theme=dark|light`, `?view=favicon&px=&theme=light|dark`, `?view=lockup&w=&h=&light=1` and `?view=banner&w=&h=&layout=card|header`.

The landing site (`teamtrailhq/teamtrail-landing`) copies from `brand/` into its `public/media/brand/`: `og-image-1200x630.png` (banner), `linkedin-discord-avatar-512.png` (square, also its apple-touch-icon), `slack-icon-512.png` (Scout) and `favicon-32.png`, `favicon-64.png` (favicon). Its `favicon.ico` and SVG favicon are built from the same mark.
