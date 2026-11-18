/** A path (with a fragment) on this origin, as a server's places are; anything else is dropped. */
export function sameOriginPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return undefined;
  try {
    return new URL(value, location.href).origin === location.origin ? value : undefined;
  } catch {
    return undefined;
  }
}
