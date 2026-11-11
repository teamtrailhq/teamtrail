import type { QrMatrix } from './qrMatrix';

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Flips the data modules the mask selects; applying it twice undoes it. */
export function applyMask(m: QrMatrix, mask: number) {
  const pick = MASKS[mask];
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++) if (!m.fixed[y][x] && pick(x, y)) m.dark[y][x] = !m.dark[y][x];
}

/** Rule 1 and 3 of the standard on one line of modules: long runs, and patterns that look like a finder. */
function linePenalty(line: boolean[]) {
  let score = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) run++;
    else {
      if (run >= 5) score += run - 2;
      run = 1;
    }
  }
  const text = line.map((d) => (d ? '1' : '0')).join('');
  for (const finder of ['00001011101', '10111010000'])
    for (let at = text.indexOf(finder); at >= 0; at = text.indexOf(finder, at + 1)) score += 40;
  return score;
}

/** How hard the symbol is to scan; the lowest of the eight masks is the one to use. */
export function penalty(m: QrMatrix) {
  let score = 0;
  let dark = 0;
  for (let i = 0; i < m.size; i++) {
    score += linePenalty(m.dark[i]);
    score += linePenalty(m.dark.map((row) => row[i]));
  }
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++) {
      if (m.dark[y][x]) dark++;
      if (x === m.size - 1 || y === m.size - 1) continue;
      const c = m.dark[y][x];
      if (c === m.dark[y][x + 1] && c === m.dark[y + 1][x] && c === m.dark[y + 1][x + 1]) score += 3;
    }
  const total = m.size * m.size;
  return score + Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
}
