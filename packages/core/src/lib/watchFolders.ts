import { lstatSync, readdirSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

interface Watched {
  watcher: FSWatcher;
  /** The folder's inode: a folder replaced under the same name is watched again. */
  ino: number;
}

/**
 * Calls `onChange` with the path (relative to `root`, `/`-separated) of every name that changes in `root` or any
 * folder under it, with one non-recursive watch per folder. A folder's own watch reports each name that lands in
 * it, so a file replaced by rename is reported every time, however often. Folders made later are watched as they
 * appear, and what is already in them is reported. Symbolic links are never followed. Returns the stop function.
 */
export function watchFolders(root: string, onChange: (rel: string) => void): () => void {
  const watched = new Map<string, Watched>();
  let closed = false;
  const relOf = (full: string) => path.relative(root, full).split(path.sep).join('/');

  function unwatchUnder(dir: string) {
    for (const [d, w] of watched) {
      if (d !== dir && !d.startsWith(dir + path.sep)) continue;
      w.watcher.close();
      watched.delete(d);
    }
  }

  function entries(dir: string) {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  function add(dir: string, ino: number, announce: boolean) {
    if (closed) return;
    let watcher: FSWatcher;
    try {
      watcher = watch(dir, (_event, name) => name && changed(path.join(dir, String(name))));
    } catch {
      return;
    }
    watcher.on('error', () => unwatchUnder(dir));
    watched.set(dir, { watcher, ino });
    for (const e of entries(dir)) {
      const full = path.join(dir, e.name);
      if (announce) onChange(relOf(full));
      if (e.isDirectory()) folder(full, announce);
    }
  }

  /** Watches `full` when it is a folder (not a link) not watched yet, or watched under another inode. */
  function folder(full: string, announce: boolean) {
    const s = lstatSync(full, { throwIfNoEntry: false });
    if (!s?.isDirectory()) return unwatchUnder(full);
    if (watched.get(full)?.ino === s.ino) return;
    unwatchUnder(full);
    add(full, s.ino, announce);
  }

  function changed(full: string) {
    if (closed) return;
    onChange(relOf(full));
    folder(full, true);
  }

  const top = lstatSync(root, { throwIfNoEntry: false });
  if (top?.isDirectory()) add(root, top.ino, false);
  return () => {
    closed = true;
    for (const w of watched.values()) w.watcher.close();
    watched.clear();
  };
}
