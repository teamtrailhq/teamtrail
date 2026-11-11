import { alignmentPositions } from './qrTables';

/** A symbol being drawn: dark modules, and which of them belong to function patterns (never masked). */
export interface QrMatrix {
  size: number;
  dark: boolean[][];
  fixed: boolean[][];
}

const bit = (value: number, i: number) => ((value >>> i) & 1) !== 0;

function set(m: QrMatrix, x: number, y: number, dark: boolean) {
  m.dark[y][x] = dark;
  m.fixed[y][x] = true;
}

function finder(m: QrMatrix, cx: number, cy: number) {
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < m.size && y >= 0 && y < m.size) set(m, x, y, ring !== 2 && ring !== 4);
    }
}

function alignment(m: QrMatrix, cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) set(m, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
}

/** The format information (level M, the mask), in both of its places, and the dark module. */
export function drawFormat(m: QrMatrix, mask: number) {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  for (let i = 0; i <= 5; i++) set(m, 8, i, bit(bits, i));
  set(m, 8, 7, bit(bits, 6));
  set(m, 8, 8, bit(bits, 7));
  set(m, 7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) set(m, 14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) set(m, m.size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) set(m, 8, m.size - 15 + i, bit(bits, i));
  set(m, 8, m.size - 8, true);
}

function drawVersion(m: QrMatrix, version: number) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const a = m.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    set(m, a, b, bit(bits, i));
    set(m, b, a, bit(bits, i));
  }
}

/** An empty symbol with its timing, finder and alignment patterns, and room reserved for format and version. */
export function functionPatterns(version: number): QrMatrix {
  const size = version * 4 + 17;
  const grid = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const m: QrMatrix = { size, dark: grid(), fixed: grid() };
  for (let i = 0; i < size; i++) {
    set(m, 6, i, i % 2 === 0);
    set(m, i, 6, i % 2 === 0);
  }
  finder(m, 3, 3);
  finder(m, size - 4, 3);
  finder(m, 3, size - 4);
  const pos = alignmentPositions(version);
  const last = pos.length - 1;
  for (let i = 0; i <= last; i++)
    for (let j = 0; j <= last; j++) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (!corner) alignment(m, pos[i], pos[j]);
    }
  drawFormat(m, 0);
  drawVersion(m, version);
  return m;
}

/** The modules in the order the standard reads them: two columns at a time, right to left, up and down in turn. */
function zigzag(size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    // the vertical timing line, column 6, is skipped
    const col = right <= 6 ? right - 1 : right;
    const upward = ((col + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      out.push([col, y], [col - 1, y]);
    }
  }
  return out;
}

/** The codewords, bit by bit, into every module no function pattern holds. */
export function drawCodewords(m: QrMatrix, codewords: number[]) {
  let i = 0;
  for (const [x, y] of zigzag(m.size)) {
    if (m.fixed[y][x] || i >= codewords.length * 8) continue;
    m.dark[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
    i++;
  }
}
