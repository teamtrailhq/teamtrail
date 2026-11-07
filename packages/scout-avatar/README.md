# Teamtrail logo and Scout badge

Two marks, one drawing style:

- **The Teamtrail logo** (`src/logo/`): a lowercase t whose stem curves into a path that runs to a connection node, on a dark tile. Favicons use it without the tile. Nav, favicon, npm, GitHub and social images use it.
- **Scout** (`src/scout/`): the voice of Teamtrail wherever you meet it, in the Lookout, Slack, the site, docs and the product video. A CRT head with ear cups and a baseball cap, drawn smooth to the proportions of the original sprite, with no frame around it. Guides are symbol badges in a circle (`guideArt.ts`): magnifier, check, shield, book, compass, and a grey plus for Community.

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
  logoMark.ts      the logo's SVG markup
  Logo.tsx         React component
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
preview/           preview page (?view=options | states | demo | square | favicon | banner); App.tsx
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

| Prop | Default | Notes |
| --- | --- | --- |
| `state` | `'idle'` | `idle` \| `speaking` \| `thinking` \| `alert` |
| `size` | `'md'` | `xs` is the simple badge at 32px. `sm` is 80px, `md` 160px and `lg` 240px. A number sets the size in units of 40px. |
| `speaking` | none | A non-empty string switches `idle`/`speaking` to speaking. `alert` and `thinking` keep priority. Once the line has played, the caption stays and the status returns to `ONLINE`. |
| `variant` | `'crt'` | `crt` \| `night` |
| `framed` | `true` (except `xs`) | HUD panel with the `Scout // ONLINE` label. |
| `caption` | `true` for md/lg | Shows the spoken line under the waveform. |
| `label` | `'Scout'` | Panel name and accessible name. |
| `onSpeakEnd` | none | Fires about 350ms after the line has played. It also fires under reduced motion. |
| `at` | none | Freezes the clock at N ms. Used for screenshots and tests. |

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

All colours and shapes are in `badgeArt.ts` and `logoMark.ts`. `--tt-keyline` puts a cream edge around the logo on dark backgrounds. After changing either, re-run the capture and copy the results to `brand/`.

## Preview, captures and brand kit

```
npm install
npm run dev                  # playground at http://localhost:5173 (+ ?view=options|states|demo)
npm run build
npm run capture              # needs Chrome (CHROME=...) and ffmpeg
```

`capture` also renders `brand/` at exact sizes:

- `github-org-avatar.png` (1000²)
- `github-social-preview.png` (1280×640) and `github-social-preview.gif` (640×320, animated, under GitHub's 1 MB limit)
- `teamtrail-banner.gif` (960×480): the README banner, one `BANNER_LOOP` pass (preview/content.ts) rendered frame by frame with a frozen clock
- `og-image-1200x630.png`
- `x-header-1500x500.png`
- `wordmark-lockup.png`: the logo lockup, mini Scout beside the wordmark
- `x-avatar-400.png`
- `slack-icon-512.png`
- `linkedin-discord-avatar-512.png`
- `favicon-64.png`, `favicon-32.png`
- `social-kit-overview.png`: a contact sheet with checks at 16 to 48px

The banner copy is agent-agnostic. The brand views are `?view=square&n=`, `?view=favicon&px=` and `?view=banner&w=&h=&layout=card|header`.
