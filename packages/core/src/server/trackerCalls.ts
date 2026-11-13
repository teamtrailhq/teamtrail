import type { TrackerAdapter } from '../adapters/adapter';

/** TrackerAdapter methods a client may call through the tracker routes. */
export const CALL_NAMES = [
  'listMaps',
  'loadMap',
  'createMap',
  'setMapMode',
  'setMapArchived',
  'setMapMeta',
  'updateMapSections',
  'createTicket',
  'addBlocking',
  'removeBlocking',
  'editTicket',
  'reopen',
  'assign',
  'comment',
  'close',
  'setMeta',
  'listDecisions',
  'createDecision',
  'markSuperseded',
] as const satisfies readonly (keyof TrackerAdapter)[];

export type CallName = (typeof CALL_NAMES)[number];

export const CALLS = new Set<keyof TrackerAdapter>(CALL_NAMES);
