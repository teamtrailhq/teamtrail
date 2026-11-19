import type { FolderView } from './types';

/** Lockfiles by the package manager that writes them, in the order they're preferred when several are there. */
export const NODE_LOCKFILES: [string, string][] = [
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
];

const MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

/**
 * The package manager a Node folder names: `packageManager` in its package.json (`pnpm@9.1.0`), else its lockfile.
 * Undefined when it names none (a workspace member, or a package that was never installed).
 */
export function nodeManager(folder: FolderView, pkg: Record<string, unknown> | undefined) {
  const declared = typeof pkg?.packageManager === 'string' ? pkg.packageManager.split('@')[0] : '';
  const lock = NODE_LOCKFILES.find(([file]) => folder.files.has(file));
  if (MANAGERS.has(declared)) return { manager: declared, lockfile: lock?.[0] };
  return lock ? { manager: lock[1], lockfile: lock[0] } : undefined;
}
