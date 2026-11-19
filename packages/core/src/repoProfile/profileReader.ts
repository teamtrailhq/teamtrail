import { createHash } from 'node:crypto';
import type { RepoFiles } from '../model/checkScreening';
import { PROFILE_LIMITS } from './limits';
import type { ProfileReader } from './types';

/**
 * Reads through `files` for the profile: each file at most once (cached), at most PROFILE_LIMITS.reads files, none
 * larger than PROFILE_LIMITS.textBytes. Everything read or listed goes into `basis`, in a fixed order.
 */
export function profileReader(files: RepoFiles): ProfileReader {
  const texts = new Map<string, Promise<string | undefined>>();
  const seen: string[] = [];
  let truncated = false;
  const load = async (rel: string) => {
    const text = await files.read(rel).catch(() => undefined);
    if (text === undefined || text.length > PROFILE_LIMITS.textBytes) return undefined;
    return text;
  };
  return {
    read(rel) {
      const cached = texts.get(rel);
      if (cached) return cached;
      if (texts.size >= PROFILE_LIMITS.reads) {
        truncated = true;
        return Promise.resolve(undefined);
      }
      const text = load(rel);
      texts.set(rel, text);
      return text;
    },
    note: (line) => void seen.push(line),
    cut: () => void (truncated = true),
    get truncated() {
      return truncated;
    },
    async basis() {
      const hash = createHash('sha256');
      for (const line of [...seen].sort()) hash.update(`list ${line}\n`);
      for (const rel of [...texts.keys()].sort()) {
        const text = await texts.get(rel);
        hash.update(`file ${rel}\n${text === undefined ? '-' : createHash('sha256').update(text).digest('hex')}\n`);
      }
      return `sha256:${hash.digest('hex')}`;
    },
  };
}
