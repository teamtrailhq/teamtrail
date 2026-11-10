/** `.agents/criteria-proposals/<mapId>.json` (proposed criteria, local only). */
const PROPOSALS = /^\.agents\/criteria-proposals\/([^/]+)\.json$/;

/**
 * The SSE message for a change to a trail's proposed criteria: `event: criteria-proposals` with its `mapId`, so the
 * inspector shows a new or replaced proposal without a reload. Undefined for any other file (temp files included).
 */
export function criteriaProposalEvent(rel: string) {
  const m = rel.match(PROPOSALS);
  return m ? `event: criteria-proposals\ndata: ${JSON.stringify({ mapId: m[1] })}\n\n` : undefined;
}
