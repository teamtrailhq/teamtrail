const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** A paired browser's name, from its user agent: "Chrome on macOS", "Safari on iPhone", or "A browser". */
export function browserName(userAgent: string | undefined): string {
  const ua = (userAgent ?? '').slice(0, 512);
  const browser = BROWSERS.find(([r]) => r.test(ua))?.[1];
  const system = SYSTEMS.find(([r]) => r.test(ua))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'A browser';
}
