import type { GateEntry } from '@teamtrail/core';

/**
 * One gate's last stretch, as Settings shows it: the tickets it held (`enforce`) and the ones it would have held
 * (`observe`), each ticket counted once per mode, and its entries newest first. `gate` is a string, since the journal
 * may name a gate this version doesn't know.
 */
export interface GateSummary {
  gate: string;
  held: number;
  wouldHold: number;
  entries: GateEntry[];
}
