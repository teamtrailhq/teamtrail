/** Keys whose value is a place on this machine's disk, whatever their case (`path`, `repoRoot`, `Paths`, `cwd`). */
const PATH_KEY = /(path|paths|root|cwd|toplevel|worktree|dir|file|files|folder|repo|base)$/i;
/** Keys that say whose tracker account this machine is signed in to. */
const ACCOUNT_KEYS = new Set(['account', 'viewer']);
/** POSIX, a Windows drive, or a UNC share. */
const ABSOLUTE = /^(\/|[A-Za-z]:[\\/]|\\\\)/;
const SEP = '[\\\\/]+';

/** An absolute path as its last two segments: enough to recognise a repo, nothing about where it lives. */
const short = (p: string) => p.split(/[\\/]/).filter(Boolean).slice(-2).join('/');

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a place and whatever path follows it, wherever it stands in a string, with either separator. */
function placePattern(place: string) {
  const segments = place
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(escaped);
  const lead = /^[A-Za-z]:/.test(place) ? '' : SEP;
  return new RegExp(`${lead}${segments.join(SEP)}(?![\\w.-])(?:${SEP}[^\\s"'\`<>|*?,;)\\]]*)?`, 'gi');
}

export type LanRedactor = (text: string) => string;

/**
 * Shortens every path under one of `places` (the project, the home folder, the temp folder) inside a string:
 * a whole value, an item of a list, or a path in the middle of a message. Longest place first, so a folder
 * inside another is never left half-shortened.
 */
export function lanRedactor(places: string[]): LanRedactor {
  const unique = [...new Set(places.filter((p) => p.replace(/[\\/]/g, '').length > 1))];
  const patterns = unique.sort((a, b) => b.length - a.length).map(placePattern);
  return (text) => patterns.reduce((s, re) => s.replace(re, short), text);
}

/**
 * What another device on the network gets to see of a JSON answer: the same, without where things live on this
 * machine's disk and without the tracker account it is signed in to. By value: any string holding a path under
 * one of the redactor's places is shortened, whatever its key and wherever in the string it stands. By key, as
 * before: an absolute path anywhere else on the disk under a path-like key becomes its last two segments.
 * Repo-relative paths, which the Lookout shows everywhere, are left alone.
 */
export function redactForLan(value: unknown, places: LanRedactor = (s) => s, key = ''): unknown {
  if (typeof value === 'string') {
    const text = places(value);
    return PATH_KEY.test(key) && ABSOLUTE.test(text) ? short(text) : text;
  }
  if (Array.isArray(value)) return value.map((v) => redactForLan(v, places, key));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (!ACCOUNT_KEYS.has(k)) out[places(k)] = redactForLan(v, places, k);
  return out;
}

/** A chunk of a server-sent event stream, each `data:` line redacted as the JSON it carries. */
export function redactEvents(chunk: string, places: LanRedactor) {
  const line = (l: string) => {
    if (!l.startsWith('data:')) return l;
    const data = l.slice(5).trimStart();
    try {
      return `data: ${JSON.stringify(redactForLan(JSON.parse(data), places))}`;
    } catch {
      return `data: ${places(data)}`;
    }
  };
  return chunk.split('\n').map(line).join('\n');
}
