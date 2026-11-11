/** A Map that keeps the `max` most recently used keys: reading or writing a key makes it the newest. */
export function lru<V>(max: number) {
  const map = new Map<string, V>();
  return {
    get(key: string) {
      const v = map.get(key);
      if (v === undefined) return undefined;
      map.delete(key);
      map.set(key, v);
      return v;
    },
    set(key: string, v: V) {
      map.delete(key);
      map.set(key, v);
      if (map.size > max) map.delete(map.keys().next().value!);
    },
    get size() {
      return map.size;
    },
  };
}
