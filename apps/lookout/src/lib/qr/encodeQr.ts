import { qrCodewords } from './qrCodewords';
import { applyMask, penalty } from './qrMask';
import { drawCodewords, drawFormat, functionPatterns } from './qrMatrix';
import { countBits, dataCodewords, MAX_VERSION } from './qrTables';

/**
 * `text` as a QR code (byte mode, error correction level M), the smallest version that holds it, with the mask
 * that scans best: rows of modules, `true` for dark. undefined when it is too long (over 213 bytes).
 */
export function encodeQr(text: string): boolean[][] | undefined {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= MAX_VERSION && 4 + countBits(version) + bytes.length * 8 > dataCodewords(version) * 8) version++;
  if (version > MAX_VERSION) return undefined;
  const m = functionPatterns(version);
  drawCodewords(m, qrCodewords(bytes, version));
  let best = 0;
  let lowest = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(m, mask);
    drawFormat(m, mask);
    const score = penalty(m);
    if (score < lowest) [best, lowest] = [mask, score];
    applyMask(m, mask);
  }
  applyMask(m, best);
  drawFormat(m, best);
  return m.dark;
}
