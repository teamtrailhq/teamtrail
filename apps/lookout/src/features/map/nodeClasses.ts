import type { DiffMark, LaidOutNode } from '@teamtrail/core';
import type { NodeTone } from './nodeTone';

/** A card's classes: its state and tone, who it's for, and what's going on around it (selection, a session, a reroute). */
export function nodeClasses(f: {
  n: LaidOutNode;
  tone: NodeTone;
  hitl: boolean;
  selected: boolean;
  live: boolean;
  waiting: boolean;
  stalled?: boolean;
  mark?: DiffMark;
  frozen?: boolean;
}) {
  const classes = ['node', `st-${f.n.state}`, `tone-${f.tone}`, f.hitl ? 'hitl' : 'afk'];
  if (f.selected) classes.push('sel');
  if (f.live) classes.push('live');
  if (f.waiting) classes.push('waiting');
  if (f.stalled && !f.waiting) classes.push('stalled');
  if (f.mark) classes.push(`mark-${f.mark}`);
  if (f.frozen) classes.push('frozen');
  return classes.join(' ');
}
