/**
 * Minimal filesystem the markdown adapter needs. The Lookout provides
 * an HTTP-backed implementation via the Vite dev server; a CLI would pass
 * one backed by node:fs.
 */
export interface MarkdownFs {
  /** All `.md` paths under the root, relative and `/`-separated. */
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
  /**
   * `base`: the file as the writer read it, before its change. A write whose base no longer matches what a gate
   * field says now is refused or merged (signedState/signedWrite.ts), so a stale writer never undoes a change it
   * didn't see.
   */
  write(path: string, text: string, opts?: { base?: string }): Promise<void>;
  /**
   * Optional: write a file only if none is there, atomically; false when one is. With it, two writers that pick
   * the same next number (several agent processes share the folder) can't both keep it.
   */
  create?(path: string, text: string): Promise<boolean>;
  /** Optional: notify on external changes so other sessions' edits stream in. */
  watch?(cb: (path: string) => void): () => void;
}
