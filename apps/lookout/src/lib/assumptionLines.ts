/** A list marker a pasted list starts its lines with: `- `, `* `, `+ `, `1. `, `1) `, and a task box after one. */
const BULLET = /^(?:[-*+]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?/;

/**
 * The assumptions New trail creates from its field: one per non-empty line, with a pasted list's markers taken off,
 * so `- The API takes batches` is the assumption "The API takes batches". Lines are kept as written otherwise.
 */
export const assumptionLines = (text: string) =>
  text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim().replace(BULLET, '').trim())
    .filter(Boolean);
