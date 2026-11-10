/**
 * Whether a key read from text (frontmatter, a YAML guide, a JSON config's names) may become a property of an
 * object built with `out[key] = …`. `__proto__` would replace that object's prototype instead (and with it what
 * every other key reads through), `constructor` and `prototype` shadow what code expects there. Parsers skip
 * them; none is a real key in any Teamtrail file.
 */
export const isSafeKey = (key: string) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype';

/**
 * `JSON.parse` for a file someone else may have written: the same value, without any `__proto__`,
 * `constructor` or `prototype` key at any depth, so code that later copies its keys onto an object one by one
 * (`out[name] = …`) can never be made to set a prototype.
 */
export const parseJsonSafe = (text: string): unknown =>
  JSON.parse(text, (key, value: unknown) => (isSafeKey(key) ? value : undefined));
