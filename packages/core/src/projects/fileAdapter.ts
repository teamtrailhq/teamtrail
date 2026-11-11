import { existsSync } from 'node:fs';
import type { TrackerAdapter } from '../adapters/adapter';
import { MarkdownAdapter } from '../adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../adapters/markdown/nodeMarkdownFs';
import { trackerPin } from '../server/trackerPin';

/**
 * A read-only view of a project's tracker that needs no network: its markdown files. Undefined for a
 * project whose approved tracker (server/trackerPin.ts) is GitHub or Linear (the tracker is only cached by a process that has it open) or a missing folder.
 */
export function fileAdapter(root: string, configDir?: string): TrackerAdapter | undefined {
  if (!existsSync(root)) return undefined;
  if (trackerPin(root, configDir).read().config.active !== 'markdown') return undefined;
  return new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
}
