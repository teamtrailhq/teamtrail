/**
 * A check as it's being edited: its name, its command as typed (kept as words when saved), the folder it runs in,
 * repo-relative as typed ('' for the repository's top), and the paths it is about as typed, comma-separated ('' for
 * every change).
 */
export interface EditedCheck {
  name: string;
  command: string;
  cwd: string;
  paths: string;
}
