import { watch } from 'node:fs';
import path from 'node:path';
import { watchFolders } from './watchFolders';

/** Where Node's recursive fs.watch is the operating system's own, which reports every name that changes. */
const NATIVE_RECURSIVE = new Set(['darwin', 'win32']);

/**
 * Calls `onChange` with the path (relative to `root`, `/`-separated) of every file or folder that changes under
 * `root`. Returns the stop function.
 *
 * On macOS and Windows that is the recursive fs.watch. Elsewhere (Linux) Node emulates recursion with one watch per
 * file, bound to the file's inode: a file replaced by rename is reported once, and never again, because the watch
 * stays on the old inode. Teamtrail writes tracker files exactly that way (trackerFileWrite.ts), so the Lookout
 * would hear a ticket's first rewrite and miss every later one, such as an agent's claim. There each folder gets its
 * own watch instead (watchFolders.ts). `native` overrides the choice, for tests.
 */
export function watchTree(root: string, onChange: (rel: string) => void, opts: { native?: boolean } = {}) {
  const native = opts.native ?? NATIVE_RECURSIVE.has(process.platform);
  if (!native) return watchFolders(root, onChange);
  const w = watch(root, { recursive: true }, (_e, f) => f && onChange(String(f).split(path.sep).join('/')));
  return () => w.close();
}
