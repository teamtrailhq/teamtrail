import { globMatch } from '../knowledge/knowledge';

const WILD = /[*?[{]/;

/** Whether `file` is in a declared glob: a pattern by its match, a plain path as itself or anything under it. */
export function pathCovered(glob: string, file: string) {
  const g = glob.replace(/^\.\//, '').replace(/\/+$/, '');
  if (WILD.test(g)) return globMatch(g, file);
  return file === g || file.startsWith(`${g}/`);
}
