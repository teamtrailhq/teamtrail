/**
 * The site's pages as the nav and the footer list them, by path on teamtrail.app. `product` is the Product ▾ menu,
 * `main` the links after it; the phone menu and the footer list both.
 */
export const SITE_LINKS = {
  product: [
    { path: '/#how', label: 'How it works' },
    { path: '/features/', label: 'Features' },
    { path: '/guides/', label: 'Guides' },
    { path: '/slack/', label: 'Scout in Slack' },
    { path: '/mobile/', label: 'Mobile' },
  ],
  main: [
    { path: '/cloud/', label: 'Cloud' },
    { path: '/docs/', label: 'Docs' },
    { path: '/#faq', label: 'FAQ' },
  ],
  install: { path: '/#install', label: 'Install' },
  privacy: { path: '/privacy/', label: 'Privacy' },
  repo: 'https://github.com/teamtrailhq/teamtrail',
} as const;
