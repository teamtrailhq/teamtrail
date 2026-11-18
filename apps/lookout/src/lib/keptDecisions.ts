import { apiBase } from './apiBase';

/** Agents' decisions this person reviewed and kept, in this browser: Since you were away says so instead of asking. */
const key = () => `teamtrail.kept-decisions${apiBase()}`;
const MAX = 200;

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key()) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const isKept = (id: string) => read().includes(id);

export function markKept(id: string) {
  try {
    localStorage.setItem(key(), JSON.stringify([...read().filter((x) => x !== id), id].slice(-MAX)));
  } catch {
    // storage blocked: kept for this page only
  }
}
