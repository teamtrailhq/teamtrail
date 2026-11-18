/** A rule the trail lead let one ticket go without (`GET /verification/rules/held`'s `waived`). */
export interface WaivedRule {
  rule: string;
  by: string;
  at: number;
  reason: string;
}
