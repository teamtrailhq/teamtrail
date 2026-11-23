# Teamtrail logo and Scout badge

Two marks, one drawing style:

- **The Teamtrail logo** (`src/logo/`): six block cursors set every 60° around an open centre. The arm pointing up is grey (`#8E8E96`), the other five blaze (`#FF6B2C`), on a transparent background, the same on light and dark pages (colours in `logoColors.ts`). `<Logo>` draws it filling its box; `round` places it smaller (`logoInCircle.ts`) for avatars shown in a circle (the GitHub, X and LinkedIn/Discord avatars); `tile` puts it on the near-black `#0A0A0B` square (`logoOnTile.ts`) for the rare place that must be opaque, never on blaze. `logoFaviconSvg()` is the mark as one SVG. The favicon, npm, GitHub and social avatars use it, and the wordmark puts it before the name.
- **Scout** (`src/scout/`): the voice of Teamtrail wherever you meet it, in the Lookout, Slack, the site, docs and the product video. An AI scout companion looking to the side, drawn as a bust in graphite, white and blaze: a screen face, a cap, a headset with a mic, an antenna lamp and a neckerchief (`badgeArt.ts`; `shape`: a circle where avatars are round, a full square for tiles and Slack; `ground`: `ink`, the default, `blaze` for app icons and Slack, `paper` on light backgrounds). Guides are drawn like the site's scenes, alone on a transparent background (`guideArt.ts`): thin square ink lines, light panels, grey text bars and one blaze square that carries the meaning: a page under a lens (reviewer), a checklist (QA), a shield with a lock (security), two pages with a bookmark (docs), a system map (architect), and an outlined plus with no accent for Community. `guideMarkup(role, theme)` draws `dark`, `light`, or `auto`, which reads the page's `--tt-guide-ink`, `-fill`, `-mute` and `-accent`.

**Which mark where**

- **Square or squarish spaces** (avatars, favicons, app icons, the GitHub and X avatars): the logo mark alone, on transparency (on the near-black tile only where a space must be opaque). Slack's app icon is Scout, on blaze.
- **Spaces wider than tall** (banners, social previews, headers, lockups, the Lookout's header, sign-in and onboarding): the `teamtrail` wordmark: the logo mark followed by the name, lowercase in Inter 600, with no cursor after it. The mark is 0.86em square, 0.24em before the name, its centre on the lowercase letters' optical middle, in its own colours on light and dark; the name is ink on light and near-white on dark.
- The mark beside the name is the wordmark; never the name alone without the mark. "Teamtrail" stays the name in running text and accessibility labels.

`ScoutAvatar` and `mountScout` draw the same badge from `badgeArt.ts`.

- **Renderings:** `crt` (day) and `night` (the cap lamp burns a little brighter).
- **Small sizes:** `xs` and anything under about 28px use the simple drawing, without the fine detail.
- **States:**
  - `idle`: flat bar eyes and a small mouth, with the cap lamp on. Blinks every ~5.6s.
  - `speaking`: the mouth follows the text, and a waveform shows only while Scout talks.
  - `thinking`: the eyes and mouth shift aside, and the cap lamp pulses.
  - `alert`: wide eyes and a rose cap lamp.

## Files

```
src/logo/
  logoShapes.ts    the mark's geometry: six arms, one grey, five blaze
  logoColors.ts    its colours, and the near-black tile's
  logoOnTile.ts    where the mark sits on its opaque tile
  logoInCircle.ts  where it sits in an avatar cropped to a circle
  logoMark.ts      the logo's SVG markup: alone, round, or on the tile
  logoFaviconSvg.ts  the standalone favicon SVG: the mark on transparency
  Logo.tsx         React component (size, round, tile)
src/scout/
  badgeArt.ts      Scout's badge: colours, grounds, lamps and SVG markup
  portraitHead.ts  the head in three-quarter view: screen, headset, cap and antenna lamp
  portraitFace.ts  the face on the screen (eyes and mouth)
  portraitBody.ts  the shoulders and neckerchief
  guideArt.ts      guide icons: line drawings like the site's scenes, dark, light or auto
  Badge.tsx        React component for a still badge at any size
  frames.ts        styles (day/night), expressions per state, status labels, timing, visemes, composeWave
  types.ts         shared types
  scoutFrame.ts    what Scout shows at a moment (state, face, layout, labels), shared by both renderers
  rects.ts         waveform rects
  ScoutAvatar.tsx  React component; Wave.tsx is its waveform
  hooks/           useBlink, useClock, useSpeechClock, usePrefersReducedMotion
  mountScout.ts    framework-free renderer with the same markup, classes and timing (for the vanilla landing page)
  scoutDom.ts      the DOM and SVG building behind mountScout
  ScoutAvatar.css  panel frame; all colors are --scout-* vars with lookout fallbacks
  index.ts         React exports, plus the logo's (import mountScout from './mountScout' directly)
preview/           preview page (?view=options | states | demo | square | favicon | lockup | banner, &round=1, &tile=1 and &ground=ink|blaze|paper for square); App.tsx
tools/
  capture.mjs      writes the PNGs, the banner GIF, the MP4 loop, the social kit zip and brand/* (Playwright + system Chrome, headless)
```

## Lookout

The Lookout imports the components from `@teamtrail/scout-avatar` (`apps/lookout/src`):

- `features/inbox/QuestionAvatar.tsx`: Scout beside an open question, unframed at 24px. It speaks the start of the question when it arrives, then waits in `alert`.
- `features/briefing/BriefingDialog.tsx`: Scout speaking the line at the top of While you were away.
- `components/ui/TooltipLayer.tsx`: Scout's tooltips, a small face next to a speech bubble.
- `components/ui/ScoutBadge.tsx`: the still `Badge`, day or night, next to lines in Scout's voice (onboarding, empty states).
- `components/ui/TeamtrailLogo.tsx`: the `Logo`.

The avatar reads the Lookout's tokens through its `--scout-*` variables (`ScoutAvatar.css`), so it follows the active fonts and palette: `--display`, `--sans`, `--mono`, `--text`, `--dim`, `--urgent`, `--line`, `--line2`, `--panel`. The activity log keeps `ScoutMark`.

## Landing page

The landing page (`teamtrailhq/teamtrail-landing`, which installs this package from the product repo next to it) imports the framework-free renderer from `@teamtrail/scout-avatar/mount`. It does not use React. Every Scout there is unframed:

- `src/main.ts`: Scout on Home's "The scout who keeps everyone on the path" card (`[data-scout]`, `sm`, day or night with the page's theme), and the guide icons (`guideMarkup`) on the guide cards (`/guides`).
- `src/slackScene.ts`: Scout next to Slack on the Scout in Slack page (`[data-slack-scout]`).
- `src/cloudScene.ts`: Scout in a square frame on the Cloud page, saying a short line every few seconds, and thinking midway along its journey, between line icons of a laptop and a phone (`[data-cloud-scout]`, `[data-cloud-mid-scout]`, `shape: 'square'`).

```ts
const scout = mountScout(host, { size: 'sm', state: 'idle', framed: false });
scout.update({ variant: 'night' });
scout.destroy();
```

## API

| Prop         | Default              | Notes                                                                                                                                                                            |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`      | `'idle'`             | `idle` \| `speaking` \| `thinking` \| `alert`                                                                                                                                    |
| `size`       | `'md'`               | `xs` is the simple badge at 32px. `sm` is 80px, `md` 160px and `lg` 240px. A number sets the size in units of 40px.                                                              |
| `speaking`   | none                 | A non-empty string switches `idle`/`speaking` to speaking. `alert` and `thinking` keep priority. Once the line has played, the caption stays and the status returns to `ONLINE`. |
| `variant`    | `'crt'`              | `crt` \| `night`                                                                                                                                                                 |
| `ground` | `'ink'` | `ink` \| `blaze` \| `paper`: the square ground behind Scout |
| `framed`     | `true` (except `xs`) | HUD panel with the `Scout // ONLINE` label.                                                                                                                                      |
| `caption`    | `true` for md/lg     | Shows the spoken line under the waveform.                                                                                                                                        |
| `label`      | `'Scout'`            | Panel name and accessible name.                                                                                                                                                  |
| `onSpeakEnd` | none                 | Fires about 350ms after the line has played. It also fires under reduced motion.                                                                                                 |
| `at`         | none                 | Freezes the clock at N ms. Used for screenshots and tests.                                                                                                                       |

`mountScout(host, options)` takes the same options except `at`, `className` and `style`, plus `shape` (`circle`, the default, or `square` for a tile or a square frame). It returns `{ update(partial), destroy() }`.

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

All colours and shapes are in `badgeArt.ts`, `guideArt.ts`, `logoShapes.ts` and `logoColors.ts`. After changing them, re-run the capture and copy the results where they are used: the Lookout's favicon (`apps/lookout/index.html`: the SVG and `brand/favicon-32.png` inline, pinned by `apps/lookout/test/favicon.test.ts`) and the landing site's `public/media/brand/` (see below).

## Preview, captures and brand kit

```
npm install
npm run dev                  # playground (+ ?view=options|states|demo)
npm run build
npm run capture              # needs Chrome (CHROME=...) and ffmpeg
```

`capture` also renders `brand/` at exact sizes:

- `github-org-avatar.png` (1000², the logo on transparency, sized for a round crop) and `github-org-avatar-wordmark.png` (1000², the wordmark on a dark square)
- `github-social-preview.png` (1280×640) and `github-social-preview.gif` (640×320, animated, under GitHub's 1 MB limit)
- `teamtrail-banner.gif` (960×480): the README banner, the `teamtrail` wordmark while the trail steps across a dot grid to its destination, one `BANNER_LOOP` pass (preview/content.ts) rendered frame by frame with a frozen clock
- `og-image-1200x630.png`
- `x-header-1500x500.png`
- `wordmark-lockup.png`, `wordmark-lockup-light.png`: the `teamtrail` wordmark (the mark, then the name) alone, on dark and on light
- `x-avatar-400.png`
- `slack-icon-512.png` (Scout on blaze) and `scout-badge-1000.png` (Scout on ink)
- `linkedin-discord-avatar-512.png`
- `logo-light-512.png`: the logo on transparency, filling the square
- `app-icon-512.png`: the logo on the near-black tile, opaque
- `favicon-64.png`, `favicon-32.png` (the logo on transparency)
- `social-kit-overview.png`: a contact sheet with checks at 16 to 48px (not copied into `brand/`; it goes in the zip)
- `teamtrail-social-kit.zip`: all of the above, prefixed `teamtrail-`

The banner copy is agent-agnostic. The brand views are `?view=square&n=&who=logo|wordmark|scout&round=1&tile=1&clear=1&ground=ink|blaze|paper`, `?view=favicon&px=`, `?view=lockup&w=&h=&light=1` and `?view=banner&w=&h=&layout=card|header`.

The landing site (`teamtrailhq/teamtrail-landing`) copies from `brand/` into its `public/media/brand/`: `og-image-1200x630.png` (banner), `linkedin-discord-avatar-512.png` (square), `app-icon-512.png` (its apple-touch-icon), `slack-icon-512.png` (Scout) and `favicon-32.png`, `favicon-64.png` (favicon). Its `favicon.ico` and SVG favicon are the same mark on transparency.
