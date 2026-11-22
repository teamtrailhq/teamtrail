# @teamtrail/site

teamtrail.app's nav, footer, shared theme and hero trail field, framework-free, with no dependencies. The site (`teamtrailhq/teamtrail-landing`) and Teamtrail Cloud's welcome page both use it, so the two read as one place. Not published to npm: the site links it as `file:../teamtrail/packages/site`, Cloud reads it from its `vendor/teamtrail`.

- `siteNav({ base, path, signIn, themeCookieDomain })` and `siteFooter({ base })`: HTML strings, rendered at build time on the site and on the server in Cloud.
- `./browser`: `createTheme({ names, storageKey })`, `initSiteNav(theme)`, `initGhStars()`, `mountTrailField({ host, clear, frame, watch, reducedMotion, theme, strength })`.
- The theme is shared in the `tt_theme` cookie (`light` or `dark`) on the whole teamtrail.app domain: `readThemeCookie`, `themeCookieString`, and `themeBootScript` for a page that sets its theme in the browser before it draws.
- Styles: `tokens.css` (the `--site-*` tokens, day and night: `data-theme` `night` or `dark`, else the system), `nav.css`, `nav-phone.css`, `footer.css`. A page includes all four.
