/** How slow the demo goes: DEMO_PACE=2 doubles every pause, 0.5 halves them. */
const PACE = Number(process.env.DEMO_PACE ?? 1) || 1;

/** A pause long enough for the audience to see a step. */
export const beat = (seconds: number) => new Promise((r) => setTimeout(r, seconds * 1000 * PACE));
