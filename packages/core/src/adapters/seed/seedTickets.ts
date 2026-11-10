import type { TicketType } from '../../model/types';

export type SeedTicket = {
  n: number;
  title: string;
  type: TicketType;
  hitl?: boolean;
  blockedBy?: number[];
  status?: 'decided' | 'claimed' | 'ruled';
  assignee?: string;
  resolution?: string;
  /** What the ticket asks for, in a sentence or two. */
  body: string;
};

/** The sample trail's tickets by issue number; decided ones carry the resolution recorded for them. */
export const SEED_TICKETS: SeedTicket[] = [
  {
    n: 143,
    body: 'Look at how Bear, Obsidian Sync and Notion resolve two edits to the same note made offline. We need to know what users already expect before we pick a merge model.',
    type: 'research',
    title: 'How do competing note apps handle offline conflicts?',
    status: 'decided',
    resolution:
      'Bear and Obsidian Sync use last-write-wins per note; Notion queues edits and merges per block. Per-block merge is the bar users expect.',
  },
  {
    n: 144,
    body: 'Decide who offline sync is for: commuters who lose signal for minutes, or field researchers who are away for days. The answer sets how long a device must work alone.',
    type: 'junction',
    title: 'Who is the primary offline user?',
    status: 'decided',
    resolution: 'Field researchers with multi-day dead zones, not commuters. Sync must survive a week offline.',
  },
  {
    n: 145,
    body: 'Measure what a CRDT history costs on a phone compared with last-write-wins: storage after compaction and merge time for a notebook of 10k notes.',
    type: 'research',
    title: 'CRDT vs last-write-wins cost on mobile storage',
    blockedBy: [143],
    status: 'decided',
    resolution: 'Automerge history adds ~1.8x storage after compaction. Acceptable under a 200 MB budget.',
  },
  {
    n: 146,
    body: 'Build a throwaway spike that loads 10k notes into Automerge on React Native and syncs two devices. Report cold start, memory and merge time on a mid-range phone.',
    type: 'prototype',
    title: 'Spike Automerge on React Native with 10k notes',
    blockedBy: [145],
    status: 'claimed',
    assignee: 'arekom',
  },
  {
    n: 147,
    body: 'Shared notebooks can get two conflicting edits from different people. Decide whether Fieldnote may merge them without asking, or must show the author what changed.',
    type: 'junction',
    title: 'Is silent auto-merge acceptable for shared notebooks?',
    blockedBy: [144],
  },
  {
    n: 148,
    body: 'Find out how much background time iOS and Android really give a sync job, and what happens to a queue of edits when the app is killed.',
    type: 'research',
    title: 'Survey background-sync limits on iOS and Android',
    blockedBy: [144],
  },
  {
    n: 149,
    body: 'Count sync failures in production by cause, so we have a baseline before changing the protocol and can see whether the new sync is better.',
    type: 'task',
    title: 'Instrument current sync failure rate in production',
  },
  {
    n: 150,
    body: 'Prototype two ways to review a merge: inline in the note, or in a queue of conflicts. Test both with five field researchers.',
    type: 'prototype',
    title: 'Conflict review UI: inline vs queue',
    blockedBy: [147],
  },
  {
    n: 151,
    body: 'Set the most storage Fieldnote may use on one device for notes and their history. It limits how much history a device keeps.',
    type: 'junction',
    title: 'What is the storage budget per device?',
    blockedBy: [146],
  },
  {
    n: 152,
    body: 'Read the sync protocol ADR and sign it off, or send it back with what has to change. Implementation starts from this document.',
    type: 'task',
    title: 'Sign off sync protocol ADR',
    hitl: true,
    blockedBy: [146, 150],
  },
  {
    n: 153,
    body: 'Plan how a device that was offline through a schema change catches up: which migrations run on the device, and in what order.',
    type: 'research',
    title: 'Schema migration strategy for offline clients',
    blockedBy: [151, 148],
  },
  {
    n: 154,
    body: 'Approve the rollout plan: who gets offline sync first behind the flag, what we watch, and what makes us turn it off.',
    type: 'task',
    title: 'Approve rollout plan behind a feature flag',
    hitl: true,
    blockedBy: [156, 153],
  },
  {
    n: 155,
    body: "Look into encrypting sync payloads end to end, so the server cannot read a note's content.",
    type: 'research',
    title: 'End-to-end encryption of sync payloads',
    status: 'ruled',
  },
  {
    n: 156,
    body: 'Queue every write on the device while offline and flush it in order on reconnect, behind the offline-sync feature flag.',
    type: 'execute',
    title: 'Implement offline write queue behind a flag',
    blockedBy: [152],
  },
];
