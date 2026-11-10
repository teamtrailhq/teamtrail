import { realpathSync } from 'node:fs';

/** The repo root as an agent may spell it: as given, and through symlinks (`/var` and `/private/var` on macOS). */
export function repoRootSpellings(repoRoot: string): string[] {
  try {
    return [...new Set([repoRoot, realpathSync(repoRoot)])];
  } catch {
    return [repoRoot];
  }
}
