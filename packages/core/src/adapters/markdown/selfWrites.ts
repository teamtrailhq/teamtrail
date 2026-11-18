/** How long after this process writes a file a watcher hit on it may be the write's own echo. */
const ECHO_MS = 1500;

/**
 * The files this adapter just wrote, to tell a watcher's echo of its own write from another writer's change made
 * in the same moment (an agent writing the same ticket). A hit within the window is an echo only when the file
 * still holds the text written here; a create, whose text isn't kept, counts as an echo for the whole window.
 */
export class SelfWrites {
  private writes = new Map<string, { at: number; text?: string }>();

  constructor(private read: (path: string) => Promise<string>) {}

  wrote(path: string, text?: string) {
    this.writes.set(path, { at: Date.now(), text });
  }

  /** Whether a watcher hit on `path` is only the echo of a write made here. */
  async echo(path: string): Promise<boolean> {
    const w = this.writes.get(path);
    if (!w || Date.now() - w.at >= ECHO_MS) return false;
    if (w.text === undefined) return true;
    const now = await this.read(path).catch(() => undefined);
    return now === w.text;
  }
}
