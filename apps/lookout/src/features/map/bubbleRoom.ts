/** The bubble's width and its gap to the card (features/bubble): room the map keeps free on its right for it. */
const BUBBLE = 360 + 14 + 16;

/** How much of the map's right side to keep clear for the bubble; none on a narrow map, where it docks below. */
export function bubbleRoom(width: number) {
  return width > 900 ? BUBBLE : 0;
}
