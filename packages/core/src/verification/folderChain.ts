/** A repo-relative folder and every folder above it, up to the repo root (`''`), nearest first. */
export function folderChain(dir: string): string[] {
  const parts = dir ? dir.split('/') : [];
  const chain: string[] = [];
  for (let n = parts.length; n >= 0; n--) chain.push(parts.slice(0, n).join('/'));
  return chain;
}
