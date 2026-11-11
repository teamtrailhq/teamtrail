/*
 * QR code model 2, versions 1–10, error correction level M (ISO/IEC 18004): enough for a pairing link with a
 * LAN address (up to 213 bytes). Tables indexed by version; index 0 is unused.
 */
export const MAX_VERSION = 10;

/** Error-correction codewords per block, level M. */
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
/** Number of blocks, level M. */
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

/** Modules that hold data and error correction, after the function patterns. */
export function rawDataModules(version: number) {
  let result = (16 * version + 128) * version + 64;
  if (version < 2) return result;
  const align = Math.floor(version / 7) + 2;
  result -= (25 * align - 10) * align - 55;
  return version >= 7 ? result - 36 : result;
}

export const eccPerBlock = (version: number) => ECC_PER_BLOCK[version];
export const blockCount = (version: number) => BLOCKS[version];

/** Data codewords the version holds at level M. */
export const dataCodewords = (version: number) =>
  Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version];

/** Bits of the character count in byte mode. */
export const countBits = (version: number) => (version < 10 ? 8 : 16);

/** The centres of the alignment patterns, on both axes. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}
