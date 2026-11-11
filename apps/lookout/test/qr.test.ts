import { describe, expect, it } from 'vitest';
import { encodeQr } from '../src/lib/qr';
import { alignmentPositions, dataCodewords } from '../src/lib/qr/qrTables';
import { rsDivisor, rsRemainder } from '../src/lib/qr/reedSolomon';

describe('QR codes for pairing links, without a dependency', () => {
  it('computes Reed-Solomon codewords as the standard does (1-M "HELLO WORLD", thonky.com)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('knows each version’s capacity and alignment patterns', () => {
    expect([1, 2, 5, 7, 10].map(dataCodewords)).toEqual([16, 28, 86, 124, 216]);
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
  });

  it('picks the smallest version that holds the link, with finders in three corners and timing lines', () => {
    const link = 'http://192.168.178.23:7420/__teamtrail/pair?code=ABCDEFGH';
    const m = encodeQr(link)!;
    expect(m.length).toBe(33); // version 4: 59 bytes in 64 data codewords
    const finderRow = [true, true, true, true, true, true, true, false];
    expect(m[0].slice(0, 8)).toEqual(finderRow);
    expect(m[0].slice(-8)).toEqual([...finderRow].reverse());
    expect(m.at(-1)!.slice(0, 8)).toEqual(finderRow);
    for (let i = 8; i < m.length - 8; i++) expect(m[6][i]).toBe(i % 2 === 0);
    expect(m[m.length - 8][8]).toBe(true); // the dark module
    expect(encodeQr('x'.repeat(214))).toBeUndefined();
  });
});
