import type { RepoUnit } from '../model/repoProfile';

/**
 * The folders an install root's dependencies land in, any one of which means it is installed (`node_modules`, Yarn
 * Plug'n'Play's `.pnp.cjs`, uv's `.venv`, Composer's `vendor`); undefined where that can't be told from the folder
 * (Go, Rust, the JVM, Bundler and Poetry install into shared caches). Workspace members install at their root.
 */
export function dependencyFolder(unit: RepoUnit): string[] | undefined {
  if (unit.memberOf !== undefined || !unit.lockfile) return undefined;
  if (unit.ecosystem === 'node' && unit.manager !== 'deno') return ['node_modules', '.pnp.cjs'];
  if (unit.ecosystem === 'python' && (unit.manager === 'uv' || unit.manager === 'pdm')) return ['.venv'];
  if (unit.ecosystem === 'php') return ['vendor'];
  return undefined;
}
