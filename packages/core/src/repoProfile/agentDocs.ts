import type { RepoFiles } from '../model/checkScreening';
import type { FolderView } from './types';

const TOP_DOCS = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'CONTRIBUTING.md', '.cursorrules'];
const GITHUB_DOCS = ['.github/copilot-instructions.md', '.github/CONTRIBUTING.md'];

/** The instructions for agents and contributors the repo already has at its top. */
export async function agentDocs(files: RepoFiles, top: FolderView): Promise<string[]> {
  const out = TOP_DOCS.filter((f) => top.files.has(f));
  for (const f of GITHUB_DOCS) if ((await files.kind(f).catch(() => undefined)) === 'file') out.push(f);
  return out;
}
