import type { TicketType } from '../model/types';

/**
 * Discovery brief: before implementation, an agent investigates the existing system and writes this; the trail lead
 * accepts it or asks for changes. Stored per trail in `<tracker dir>/briefs/<mapId>.md`, the same for every tracker.
 * A trail requires discovery when it has a brief file; trails from before briefs have none and are unaffected.
 */
export type BriefStatus = 'draft' | 'submitted' | 'accepted' | 'changes-requested';

export interface BriefSections {
  summary: string;
  /** Who it affects, the business rules and UX principles that apply, plan or pricing constraints. */
  productContext: string;
  /** Files, services and modules, with paths. */
  existing: string;
  conventions: string;
  dataModel: string;
  api: string;
  risks: string;
  assumptions: { id: string; text: string }[];
  openQuestions: string[];
}

export interface DiscoveryBrief {
  mapId: string;
  status: BriefStatus;
  /** The ticket the brief is written in. */
  ticketId?: string;
  author?: string;
  submittedAt?: number;
  /** When the trail lead accepted it or asked for changes. */
  decidedAt?: number;
  /** The trail lead's note with a change request. */
  note?: string;
  sections: BriefSections;
  /**
   * Set when the file says accepted but the trail lead never accepted this content on this machine: `elsewhere`
   * (a teammate's machine, or before approvals were kept per machine) or `changed` (edited since). The brief then
   * reads as submitted, so the gate is closed and the human reviews it again. Never written to the file.
   */
  approval?: 'elsewhere' | 'changed';
}

export const BRIEF_DIR = 'briefs';

export const EMPTY_SECTIONS: BriefSections = {
  summary: '',
  productContext: '',
  existing: '',
  conventions: '',
  dataModel: '',
  api: '',
  risks: '',
  assumptions: [],
  openQuestions: [],
};

/** Ticket types agents may claim before the brief is accepted: investigation, decisions with the human, reviews. */
export const DISCOVERY_TYPES: TicketType[] = ['research', 'junction', 'review'];

const UNAPPROVED: Record<NonNullable<DiscoveryBrief['approval']>, string> = {
  elsewhere:
    'the brief was accepted on another machine, not on this one: the human has to accept it here in the Lookout (editing the file does not accept it)',
  changed:
    'the brief file changed after the human accepted it, so they have to review it again in the Lookout (editing the file does not accept it)',
};

function briefState(brief: DiscoveryBrief): string {
  switch (brief.status) {
    case 'submitted':
      return brief.approval
        ? UNAPPROVED[brief.approval]
        : 'the brief is waiting for the human to review it in the Lookout';
    case 'changes-requested':
      return `the human asked for changes to the brief: ${brief.note ?? 'see the Lookout'}`;
    default:
      return 'nobody has submitted the discovery brief yet';
  }
}

/**
 * Why a claim of `type` is refused while this brief isn't accepted, or `undefined` when it's allowed. Whether the trail
 * requires discovery at all is the machine's fact (discoveryGate.ts), not the brief file's.
 */
export function gateReason(brief: DiscoveryBrief | undefined, type: TicketType): string | undefined {
  if (!brief || brief.status === 'accepted' || DISCOVERY_TYPES.includes(type)) return undefined;
  const state = briefState(brief);
  return `This trail needs an accepted discovery brief before ${type} tickets can be claimed, and ${state}. Work research and junction tickets meanwhile, or write the brief with submit_brief.`;
}

/** The body of the discovery ticket new trails start with. */
export const DISCOVERY_TICKET = {
  title: 'Discovery brief: map the existing system',
  type: 'research' as const,
  body: [
    'Investigate before anything is built, then call `submit_brief`. Cite real paths; never guess.',
    '',
    '- **Summary**: what this trail changes, in a few lines.',
    "- **Product context**: who it affects, the business rules and UX principles that apply, plan or pricing constraints. Ask the human with `ask_human` when the repo doesn't tell you.",
    '- **Existing implementation**: the files, services and modules involved, each with its path and one line.',
    '- **Conventions and abstractions** to follow.',
    '- **Data model impact** and **API impact**.',
    '- **Risks and possible regressions**.',
    '- **Assumptions** you rely on, and **open questions**.',
    '',
    'Implementation tickets (task, execute, prototype) can be claimed once the human accepts the brief. Afterwards, revise the planned tickets with `add_ticket` and `update_trail` if the brief changed the picture.',
  ].join('\n'),
};

/** The brief after an agent submits it: sections replaced, status submitted, any old change note cleared. */
export function submitted(
  prev: DiscoveryBrief | undefined,
  input: { mapId: string; sections: BriefSections; author: string; ticketId?: string },
  now = Date.now(),
): DiscoveryBrief {
  return {
    mapId: input.mapId,
    status: 'submitted',
    ticketId: input.ticketId ?? prev?.ticketId,
    author: input.author,
    submittedAt: now,
    sections: input.sections,
  };
}

/** The trail lead's call on a submitted brief. Only a submitted brief can be decided; a change request needs a note. */
export function decided(
  b: DiscoveryBrief,
  call: { kind: 'accept' } | { kind: 'request-changes'; note: string },
  now = Date.now(),
): DiscoveryBrief {
  if (b.status !== 'submitted') throw new Error(`the brief is ${b.status}, not submitted`);
  if (call.kind === 'accept') return { ...b, status: 'accepted', decidedAt: now, note: undefined, approval: undefined };
  const note = call.note.trim();
  if (!note) throw new Error('say what should change');
  return { ...b, status: 'changes-requested', decidedAt: now, note, approval: undefined };
}
