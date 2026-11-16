import type { GuidePayload } from '../model/guide';
import { guidePayload } from './resolveGuide';
import type { ResolvedTicketGuide } from './resolveGuides';

/** What a claim may carry of guide instructions in all; past it a guide comes without them, and says so. */
export const GUIDES_PAYLOAD_BYTES = 32 * 1024;

export interface GuidesPayload {
  guides: GuidePayload[];
  /** Guides the ticket asks for that agents can't use now, one line each. */
  warnings: string[];
}

const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

const warning = (r: Extract<ResolvedTicketGuide, { kind: 'disabled' }>) =>
  `This ticket takes guide ${r.id}, which can't be used now (${r.reason}). Work it without that guide's instructions; the human has been told.`;

/**
 * Every active guide of a ticket as an agent takes it on (instructions, checklist, required checks), in order, with
 * the instructions only while they fit in GUIDES_PAYLOAD_BYTES; and a warning for each guide that can't be used.
 */
export function guidesPayload(list: ResolvedTicketGuide[]): GuidesPayload {
  const guides: GuidePayload[] = [];
  const warnings: string[] = [];
  let left = GUIDES_PAYLOAD_BYTES;
  for (const r of list) {
    if (r.kind === 'disabled') {
      warnings.push(warning(r));
      continue;
    }
    const full: GuidePayload = { ...guidePayload(r.guide), via: r.via };
    const size = bytes(full.instructions);
    const fits = size <= left;
    if (fits) left -= size;
    guides.push(fits ? full : { ...full, instructions: '', instructionsOmitted: true });
  }
  return { guides, warnings };
}
