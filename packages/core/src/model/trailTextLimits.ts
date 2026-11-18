/**
 * How much free text a trail's map takes, wherever it is written (the Lookout's New trail, `start_trail`,
 * `update_trail`): enough for a destination and notes that are whole markdown documents, with a maximum so one map
 * stays a file Teamtrail reads whole and a tracker issue it can post. Assumptions are one line each.
 */
export const TRAIL_TEXT_LIMITS = {
  /** Characters of the destination. */
  destination: 10_000,
  /** Characters of the notes. */
  notes: 50_000,
  /** Assumptions a trail starts with. */
  assumptions: 100,
  /** Characters of one assumption. */
  assumption: 500,
} as const;
