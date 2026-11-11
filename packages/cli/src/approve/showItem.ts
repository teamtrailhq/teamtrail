import type { TrustItem } from '@teamtrail/core';

const STANDING = {
  elsewhere: 'came with the repo, never approved on this machine',
  changed: 'changed since you approved it here',
};

const indent = (lines: string[]) => lines.map((l) => `    ${l}`).join('\n');

/**
 * One pending item for the terminal: what it is, why it waits, what changed, all of it when nobody committed it
 * (an agent may have written it), any advice, and the hash `--hash` takes.
 */
export function showItem(item: TrustItem): string {
  const whole =
    item.committed === false ? `\n  not committed, so here it is whole:\n${indent(item.content.split('\n'))}` : '';
  const advice = item.warnings.map((w) => `  worth a look: ${w}\n`).join('');
  return `\n  ${item.title}\n  ${STANDING[item.standing]}\n${indent(item.lines)}${whole}\n${advice}  hash ${item.hash}\n`;
}
