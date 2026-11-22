/** A page's theme, as browser/createTheme.ts keeps it. */
export type ThemeControl = {
  /** Whether the page shows night now: its `data-theme`, else the system's. */
  isNight: () => boolean;
  /** Calls `listener` after every change of theme. */
  onChange: (listener: () => void) => void;
  /** Shows night or day, keeps the choice (this site's storage and the shared cookie) and tells the listeners. */
  choose: (o: { night: boolean; cookieDomain?: string }) => void;
  /** Marks `data-look` (night or day) on `<html>`, where the toggle's icon reads it. */
  mark: () => void;
};
