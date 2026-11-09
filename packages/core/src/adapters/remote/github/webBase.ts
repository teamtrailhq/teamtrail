/** github.com, or the fake GitHub's base in the end-to-end check (`$TEAMTRAIL_GITHUB_WEB`). */
export const webBase = (webUrl?: string) => (webUrl ?? 'https://github.com').replace(/\/$/, '');
