import path from 'node:path';
import { signedFs } from '../../signedState/signedFs';
import type { MarkdownFs } from './markdownFs';
import { rawMarkdownFs } from './rawMarkdownFs';

export interface NodeMarkdownFsOptions {
  /** Who writes through it, kept with each signed change: `lookout`, `agent claude-01`, … */
  by?: string | (() => string);
}

/**
 * The tracker folder for Teamtrail running next to the repo (the CLI, the Lookout's server, MCP servers): what it
 * writes to a trail is signed on this machine, and what it reads counts only as signed (signedState/signedFs.ts).
 */
export function nodeMarkdownFs(root: string, opts: NodeMarkdownFsOptions = {}): MarkdownFs {
  const abs = path.resolve(root);
  const { by = 'teamtrail' } = opts;
  return signedFs(abs, rawMarkdownFs(abs), typeof by === 'function' ? by : () => by);
}
