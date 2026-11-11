import type { RerouteChange, RerouteProposal } from '../../model/reroute';
import { oneLine } from '../../model/safeText';

/** A setting change in plain words: "skip discovery", "switch the trail to plan+execute", "set the destination to “…”". */
export function settingText(c: RerouteChange | undefined): string {
  switch (c?.op) {
    case 'skip_discovery':
      return 'skip discovery';
    case 'set_mode':
      return `switch the trail to ${c.mode}`;
    case 'update_destination':
      return `set the destination to “${oneLine(c.text).slice(0, 300)}”`;
    default:
      return 'change a setting of yours';
  }
}

/** What a setting request asks, as its card and its decision record put it: "claude-01 asks to skip discovery". */
export const settingAsk = (p: Pick<RerouteProposal, 'by' | 'changes'>) =>
  `${p.by} asks to ${settingText(p.changes[0])}`;
