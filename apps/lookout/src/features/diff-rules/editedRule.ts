/**
 * A diff rule as it's being edited: its globs as typed (comma-separated), the check it runs ('' for none), its
 * question ('' for none) and why it exists. A new rule has no id until the server numbers it.
 */
export interface EditedRule {
  id?: string;
  when: string;
  check: string;
  ask: string;
  why: string;
}
