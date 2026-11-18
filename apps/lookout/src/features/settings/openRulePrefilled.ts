import { parseSettingsRoute } from './parseSettingsRoute';
import { rulePrefillHref } from './rulePrefillHref';

/**
 * Opens Settings → Verification → Rules with a suggested rule filled in: `?settings=rules&when=<globs>&why=<reason>`,
 * which the Rules editor reads. Nothing is saved until the human does it there. Before the Rules section exists,
 * Verification opens with the same parameters.
 */
export function openRulePrefilled(open: (target: string) => void, rule: { when: string[]; why: string }) {
  const rules = String(parseSettingsRoute('rules')?.section) === 'rules';
  open(rules ? 'rules' : 'verification');
  history.replaceState(history.state, '', rulePrefillHref(location.href, rule));
}
