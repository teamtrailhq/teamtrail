/**
 * A check as it's being edited: its name, its command as typed (kept as words when saved) and the folder it runs
 * in, repo-relative as typed ('' for the repository's top).
 */
export interface EditedCheck {
  name: string;
  command: string;
  cwd: string;
}
