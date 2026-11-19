import type { Need } from '../model/repoProfile';
import { PROFILE_LIMITS } from './limits';
import { secretShaped } from './secretShaped';
import type { FolderView, ProfileReader } from './types';

/** Example env files a repo commits for people to copy: names only are read from them, never a value kept. */
const EXAMPLES = ['.env.example', '.env.sample', '.env.template', '.env.test.example', '.env.dist'];

/**
 * The variable names a folder's example env files list (`DATABASE_URL=`), as needs: names and where they were
 * seen, never their values. The real `.env` is never read.
 */
export async function envExampleNeeds(folder: FolderView, reader: ProfileReader): Promise<Need[]> {
  const out: Need[] = [];
  for (const name of EXAMPLES.filter((f) => folder.files.has(f))) {
    const path = folder.dir ? `${folder.dir}/${name}` : name;
    const text = (await reader.read(path)) ?? '';
    for (const m of text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)) {
      if (out.length >= PROFILE_LIMITS.variables) break;
      out.push({ kind: 'variable', name: m[1], secretShaped: secretShaped(m[1]), why: `listed in ${path}` });
    }
  }
  return out;
}
