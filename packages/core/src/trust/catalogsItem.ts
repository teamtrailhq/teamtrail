import { catalogsApproval } from '../guides/catalogsApproval';
import { parseGuidesConfig } from '../guides/guidesConfig';
import { GUIDES_CONFIG_FILE } from '../model/guide';
import { lineDiff } from './lineDiff';
import type { TrustItem } from './trustItem';
import { trustKey } from './trustLedger';

/** Each catalog as the human should judge it: its name, the host it's fetched from, and the address. */
function catalogLines(text: string) {
  const { config, errors } = parseGuidesConfig(text);
  const lines = config.registries.map((r, i) => `${i + 1}. ${r.name} · ${hostOf(r.url)} · ${r.url}`);
  return { lines: lines.length ? lines : ['no catalogs: guides can only be added from files'], errors };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * guides.json when it differs from what the trail lead approved here: the catalogs it would search, in order, each
 * with its host, and what changed since the approved version.
 */
export function catalogsItem(root: string): TrustItem[] {
  const a = catalogsApproval(root);
  if (!a.pending || a.text === undefined || !a.hash) return [];
  const standing = a.approved ? ('changed' as const) : ('elsewhere' as const);
  const { lines, errors } = catalogLines(a.text);
  const changed = a.approved?.content ? ['', 'Changed in the file:', ...lineDiff(a.approved.content, a.text)] : [];
  return [
    {
      key: trustKey.catalogs,
      kind: 'catalogs',
      hash: a.hash,
      content: a.text,
      standing,
      title: `Guide catalogs in ${GUIDES_CONFIG_FILE}`,
      lines: [...lines, ...changed],
      warnings: errors,
      file: GUIDES_CONFIG_FILE,
      // where guides come from is always looked at on its own, never adopted with the rest
      alone: true,
    },
  ];
}
