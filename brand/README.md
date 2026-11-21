# Teamtrail brand pack

The Teamtrail logo, the `teamtrail` wordmark (the logo followed by the name) and Scout's avatar, rendered at exact sizes. Source and re-rendering: [`packages/scout-avatar`](../packages/scout-avatar) (`npm run capture`).

The look: near-black (`#0A0A0B`) and white surfaces, square corners, Inter and JetBrains Mono, and one accent, blaze (`#FF6B2C`; `#BF3900` where it sits on a light page, as text or a mark, the Lookout's day `--accent` in `apps/lookout/src/styles/theme.css`).

## Which mark where

- **Square or squarish spaces** (avatars, favicons, app icons, the GitHub and X avatars): the logo mark alone, six block cursors set every 60° around an open centre, an asterisk whose arms stop short of the middle. The arm pointing up is grey (`#8E8E96`), the other five blaze (`#FF6B2C`). It sits on a transparent background, in the same colours on light and dark pages: there is no light or dark version. Where a space must be opaque (an app icon), it goes on the near-black `#0A0A0B` tile (`app-icon-512.png`), never on blaze, where the blaze arms would vanish. The source is `logoShapes` in `packages/scout-avatar/src/logo/`.
- **Scout's Slack app icon** is Scout's avatar on the blaze ground, not the logo: Scout is who talks in Slack. It fills the square (Slack rounds the corners); its app card's background is `#141416`, ink (`background_color` in `apps/scout-service/slack-manifest.json`), so the blaze icon stands out on it.
- **Spaces wider than tall** (banners, social previews, headers, lockups, the Lookout's header, sign-in and onboarding): the `teamtrail` wordmark: the logo mark followed by the name, lowercase in Inter 600, with no cursor after it. The mark is 0.86em square, 0.24em before the name, its centre on the lowercase letters' optical middle, in its own colours on light and dark; the name is ink on light and near-white on dark.
- The mark beside the name is the wordmark; never the name alone without the mark. "Teamtrail" stays the name in running text and accessibility labels.

| File                              | Size      | Use it for                                                                                                                                       |
| --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `github-org-avatar.png`           | 1000×1000 | GitHub organization avatar (and npm's profile picture): the logo on transparency, sized for a round crop                                       |
| `github-org-avatar-wordmark.png`  | 1000×1000 | Alternative org avatar: the `teamtrail` wordmark on a near-black square (the rule above prefers the mark alone for square spaces)          |
| `github-social-preview.gif`       | 640×320   | Animated GitHub repository social preview, under GitHub's 1 MB limit (Settings → Social preview). Sites that don't play GIFs show its first frame |
| `github-social-preview.png`       | 1280×640  | Still version of the GitHub social preview                                                                                                       |
| `teamtrail-banner.gif`            | 960×480   | Animated README banner: the `teamtrail` wordmark while the trail steps across a dot grid, past its tickets, to its destination     |
| `og-image-1200x630.png`           | 1200×630  | Open Graph / Twitter card image for teamtrail.app and link previews                                                                              |
| `x-avatar-400.png`                | 400×400   | X (Twitter) profile picture: the logo on transparency, sized for the round crop                                                                  |
| `x-header-1500x500.png`           | 1500×500  | X (Twitter) header banner                                                                                                                        |
| `wordmark-lockup.png`             | 960×240   | The `teamtrail` wordmark (mark and name) on near-black, for docs, decks and press                                                                             |
| `wordmark-lockup-light.png`       | 960×240   | The same wordmark on white                                                                                                                       |
| `teamtrail-social-loop.mp4`       | 1280×640  | The animated banner as a video, for posts on X, LinkedIn and the like                                                                            |
| `linkedin-discord-avatar-512.png` | 512×512   | LinkedIn and Discord avatars: the logo on transparency, sized for the round crop                                                                 |
| `slack-icon-512.png`              | 512×512   | Slack app icon, Scout's avatar on the blaze ground filling the square, since Scout is who talks in Slack                                        |
| `scout-badge-1000.png`            | 1000×1000 | Scout's avatar on ink, for docs, decks and press                                                                                                 |
| `logo-light-512.png`              | 512×512   | The logo on transparency, filling the square, for any background                                                                                 |
| `app-icon-512.png`                | 512×512   | The logo on the near-black tile, for places that need an opaque square (an app icon, an apple-touch-icon)                                        |
| `favicon-32.png`                  | 32×32     | Browser favicon: the logo on transparency, the same on light and dark tabs                                                                       |
| `favicon-64.png`                  | 64×64     | High-DPI browser favicon                                                                                                                         |

[`teamtrail-social-kit.zip`](teamtrail-social-kit.zip) bundles every file above (prefixed `teamtrail-`) plus the `social-kit-overview.png` contact sheet in one download; `npm run capture` writes it.

## Scout

Scout keeps his drawing (cap, headset, antenna lamp, neckerchief) in graphite, white and blaze, on one of three square grounds (`SCOUT_GROUNDS` in `packages/scout-avatar/src/scout/badgeArt.ts`): ink (`#141416`, the default), blaze (`#FF6B2C`, app icons and Slack) and paper (`#E9E9EC`, on light backgrounds, with a darker cap). The antenna lamp is blaze when on, ember (`#7A2E10`) while he thinks, and rose (`#FF4D7A`) when he needs you.

## Guide icons

Each guide is one flat symbol, alone on a transparent background so it sits on the page itself: no tile, no border (`guideMarkup` in `packages/scout-avatar/src/scout/guideArt.ts`). Ink with one blaze accent, no colour per guide. On dark: ink `#EDEDEF`, fill `#1C1C1F`, accent `#FF6B2C`; on light: ink `#0E0F11`, fill `#FFFFFF`, accent `#D43F00`. Community's plus has no accent.

## Proof badges

`badges/verified.svg` and `badges/not-verified.svg` are the Verified by Teamtrail badges, in the shields flat style (20px tall; Verdana, like shields): the logo mark and "Teamtrail" on shields' grey, then "verified" on green (`#0e9f63`, the Lookout's done) or "not verified" on amber (`#a87900`), never red and never the blaze accent. A proof report in a pull request shows one at its top (`packages/core/src/proof/proofBadge.ts`), served by the site as `https://www.teamtrail.app/badges/<name>.svg`; the landing keeps the same files in `public/badges/`.

The landing ([teamtrail-landing](https://github.com/teamtrailhq/teamtrail-landing)) serves its own copies of the favicons, the avatar, the app icon, OG image and Slack icon from `public/media/brand/`.
