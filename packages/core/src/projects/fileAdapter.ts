import { existsSync } from 'node:fs';
import type { TrackerAdapter } from '../adapters/adapter';
import { MarkdownAdapter } from '../adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../adapters/markdown/nodeMarkdownFs';
import { projectConfig } from '../server/trackerConfig';

/**
 * A read-only view of a project's tracker that needs no network: its markdown files. Undefined for a
 * project on GitHub or Linear (the tracker is only cached by a process that has it open) or a missing folder.
 */
export function fileAdapter(root: string): TrackerAdapter | undefined {
  if (!existsSync(root)) return undefined;
  if (projectConfig(root).read().active !== 'markdown') return undefined;
  return new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
}
