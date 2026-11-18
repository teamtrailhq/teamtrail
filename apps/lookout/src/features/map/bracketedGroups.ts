import type { LaidOutNode, LayoutGroup } from '@teamtrail/core';

/**
 * Splits the cards a set of connectors leads to (`ends`: the trail's first tickets for `main`, its last ones for the
 * destination) into the wrapped layers they fill entirely, joined once by a bracket, and the cards joined one by one.
 */
export function bracketedGroups(input: { groups: LayoutGroup[]; nodes: LaidOutNode[]; ends: LaidOutNode[] }) {
  const { groups, nodes, ends } = input;
  const whole = groups.filter((_, gi) => {
    const members = nodes.filter((n) => n.wrap?.group === gi);
    return members.length > 0 && members.every((n) => ends.includes(n));
  });
  const wholeIds = new Set(whole.map((g) => groups.indexOf(g)));
  const single = ends.filter((n) => n.wrap === undefined || !wholeIds.has(n.wrap.group));
  return { whole, single };
}
