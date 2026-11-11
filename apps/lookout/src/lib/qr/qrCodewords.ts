import { blockCount, countBits, dataCodewords, eccPerBlock, rawDataModules } from './qrTables';
import { rsDivisor, rsRemainder } from './reedSolomon';

/** The data codewords: byte mode, the count, the bytes, a terminator and padding to the version's capacity. */
function dataBytes(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, countBits(version));
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(version) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

/** The data split into blocks, each with its error correction, interleaved as the symbol stores them. */
export function qrCodewords(bytes: Uint8Array, version: number): number[] {
  const data = dataBytes(bytes, version);
  const blocks = blockCount(version);
  const ecc = eccPerBlock(version);
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks);
  const divisor = rsDivisor(ecc);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const block = data.slice(k, k + shortLength - ecc + (i < shortBlocks ? 0 : 1));
    k += block.length;
    const check = rsRemainder(block, divisor);
    if (i < shortBlocks) block.push(0);
    all.push([...block, ...check]);
  }
  const out: number[] = [];
  for (let i = 0; i < all[0].length; i++)
    for (let j = 0; j < all.length; j++) if (i !== shortLength - ecc || j >= shortBlocks) out.push(all[j][i]);
  return out;
}
