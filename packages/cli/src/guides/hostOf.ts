/** The host a catalog is fetched from, shown next to its name so a familiar name can't hide another address. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
