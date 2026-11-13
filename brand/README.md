# Teamtrail brand pack

The Teamtrail logo, the `teamtrail.` wordmark and Scout's avatar, rendered at exact sizes. Source and re-rendering: [`packages/scout-avatar`](../packages/scout-avatar) (`npm run capture`).

## Which mark where

- **Square or squarish spaces** (avatars, favicons, app icons, the GitHub and X avatars): the `t.` logo, as the tile or the bare mark.
- **Scout's Slack app icon** is Scout's avatar, not the logo: Scout is who talks in Slack. It fills the square (Slack rounds the corners); its app card's background is `#4F8A48`, the avatar's moss.
- **Spaces wider than tall** (banners, social previews, headers, lockups, the Lookout's sign-in and onboarding): the `teamtrail.` wordmark, lowercase in Londrina Solid 900 with the orange dot.
- Never both side by side. "Teamtrail" stays the name in running text and accessibility labels.

| File                              | Size      | Use it for                                                                                                                                      |
| --------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-org-avatar.png`           | 1000×1000 | GitHub organization avatar: the logo tile (dark version)                                                                                         |
| `github-org-avatar-wordmark.png`  | 1000×1000 | Alternative org avatar: the `teamtrail.` wordmark on a dark square (the rule above prefers the tile for square spaces)                          |
| `github-social-preview.gif` | 640×320 | Animated GitHub repository social preview, under GitHub's 1 MB limit (Settings → Social preview). Sites that don't play GIFs show its first frame |
| `github-social-preview.png`       | 1280×640  | Still version of the GitHub social preview                                                                                    |
| `teamtrail-banner.gif`            | 960×480   | Animated README banner: the `teamtrail.` wordmark while the trail walks to its destination, the orange dot (still platforms use the PNGs) |
| `og-image-1200x630.png`           | 1200×630  | Open Graph / Twitter card image for teamtrail.app and link previews                                                                              |
| `x-avatar-400.png`                | 400×400   | X (Twitter) profile picture                                                                                                                     |
| `x-header-1500x500.png`           | 1500×500  | X (Twitter) header banner                                                                                                                       |
| `wordmark-lockup.png`             | 960×240   | The `teamtrail.` wordmark on dark, for docs, decks and press                                                                               |
| `wordmark-lockup-light.png`       | 960×240   | The same wordmark on a light background                                                                                                           |
| `teamtrail-social-loop.mp4`       | 1280×640  | The animated banner as a video, for posts on X, LinkedIn and the like                                                                           |
| `linkedin-discord-avatar-512.png` | 512×512   | LinkedIn and Discord avatars                                                                                                                    |
| `slack-icon-512.png`              | 512×512   | Slack app icon, Scout's avatar filling the square, since Scout is who talks in Slack                       |
| `scout-badge-1000.png`            | 1000×1000 | Scout's avatar for docs, decks and press                                                                                                        |
| `logo-light-512.png`              | 512×512   | The logo's light version, for light backgrounds                                                                                                 |
| `favicon-32.png`                  | 32×32     | Browser favicon: the bare mark, light version (for light tabs)                                                                                  |
| `favicon-64.png`                  | 64×64     | High-DPI browser favicon, light version                                                                                                         |
| `favicon-32-dark.png`, `favicon-64-dark.png` | 32×32, 64×64 | The same, dark version (for dark tabs)                                                                                         |

[`teamtrail-social-kit.zip`](teamtrail-social-kit.zip) bundles every file above (prefixed `teamtrail-`) plus the `social-kit-overview.png` contact sheet in one download.

The landing ([teamtrail-landing](https://github.com/teamtrailhq/teamtrail-landing)) serves its own copies of the favicons, OG image and Slack icon from `public/media/brand/`.
