import path from 'node:path';
import { packageSpec } from '@teamtrail/core';

/** How an agent's config starts this same CLI again. */
export interface SelfCommand {
  command: string;
  args: string[];
  /** `teamtrail@<version>` when it comes from npm; undefined for a local build. */
  pinned?: string;
}

/**
 * The command `connect` registers, so every agent session runs the CLI that ran `connect` and not whatever is
 * newest on npm: `npx -y teamtrail@<its exact version>` when this CLI was installed from npm (it runs from a
 * `node_modules/teamtrail` folder: npx's cache, a global or a project install). A local build (a checkout's
 * `dist/cli.js`) has no published version to name, so it registers itself by path, `node <this file>`: still
 * exactly this code, and nothing is fetched.
 */
export function selfCommand(o: { version?: string; file: string }): SelfCommand {
  const spec = packageSpec(o.version);
  const fromNpm = o.file.split(path.sep).includes('node_modules') || o.file.includes('/node_modules/');
  if (fromNpm && spec.includes('@')) return { command: 'npx', args: ['-y', spec], pinned: spec };
  return { command: 'node', args: [o.file] };
}
