import type { Need } from '../model/repoProfile';
import { imageService } from './imageService';
import type { FolderView, ProfileReader } from './types';

const COMPOSE = ['compose.yml', 'compose.yaml', 'docker-compose.yml', 'docker-compose.yaml'];

/** The services a top-level compose file runs (postgres, redis, …), by their images. */
export async function composeNeeds(top: FolderView, reader: ProfileReader): Promise<Need[]> {
  const out: Need[] = [];
  for (const file of COMPOSE.filter((f) => top.files.has(f))) {
    const text = (await reader.read(file)) ?? '';
    for (const m of text.matchAll(/^\s*image:\s*["']?([^\s"']+)/gm)) {
      const name = imageService(m[1]);
      if (name) out.push({ kind: 'service', name, why: `${m[1]} in ${file}` });
    }
  }
  return out;
}
