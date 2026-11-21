import { LOGO_COLORS } from './logoColors';

/** One arm: the wordmark's block cursor, standing on the top edge of the 200 box, 34 short of its centre. */
const ARM = 'x="88" y="10" width="24" height="56"';

/**
 * The mark's shapes in its 200×200 box, on transparency: six block cursors around (100,100), every 60°, an asterisk
 * with an open centre. The arm pointing up is grey, the other five blaze. They reach 90.8 from the centre (an arm's
 * outer corners).
 */
export function logoShapes() {
  const arms = [60, 120, 180, 240, 300].map((deg) => `<rect ${ARM} transform="rotate(${deg} 100 100)"/>`);
  return `<g fill="${LOGO_COLORS.arm}">${arms.join('')}</g><rect ${ARM} fill="${LOGO_COLORS.lead}"/>`;
}
