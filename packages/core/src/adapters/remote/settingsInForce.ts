import { settingsFromKey, settingsKey, type BodySettings } from './bodySettings';
import type { Writer } from './writer';

/** Settings someone else wrote into an issue that this machine has not accepted; the accepted ones stay in force. */
export interface WaitingSettings {
  mapId: string;
  /** The settings found in the issue, as `settingsKey` writes them. */
  found: string;
  /** Who wrote them, when the tracker says. */
  by?: string;
  /** When this machine first saw them. */
  at: number;
}

/** What this machine knows about one issue's settings. */
export interface AcceptedEntry {
  /** The tracker account this machine read and wrote as; an entry made under another account doesn't count. */
  viewer?: string;
  /** The settings in force: the last ones this machine wrote, or read back from its own account. */
  ok?: string;
  /** Settings this machine is writing right now; reading them back counts as ours. */
  sending?: string;
  waiting?: WaitingSettings;
}

/** An issue whose settings in the tracker differ from the ones in force here. */
export interface UnacceptedSettings {
  issueId: string;
  /** The settings in force, as `settingsKey` writes them. */
  inForce: string;
  waiting: WaitingSettings;
}

interface Input {
  writer: Writer;
  /** The settings in the issue body as read. */
  found: BodySettings;
  entry: AcceptedEntry | undefined;
  /** The account this machine reads as now. */
  viewer: string | undefined;
  mapId: string;
  now: number;
}

/** The entry when it was made under this account; any other (another login, an edited file) counts as none. */
const ownEntry = (entry: AcceptedEntry | undefined, viewer: string | undefined) =>
  entry && viewer && entry.viewer === viewer ? entry : undefined;

/**
 * Which settings apply to an issue, and what to remember about it. The body's own are taken when this account
 * wrote the body, or when they are what this machine last put or accepted. A teammate's other settings wait for
 * the human (the attention queue), with the accepted ones in force meanwhile: a ticket's own level overrides its
 * trail's, so even a "stricter" one can lower the bar, and none is taken unchecked. An outsider's are never taken. Nothing accepted yet (a new machine, a fresh clone, a lost or edited file) is no exception: it never
 * means "take what is there".
 */
export function settingsInForce(i: Input): { use: BodySettings; entry: AcceptedEntry | undefined } {
  const { writer, viewer } = i;
  const entry = ownEntry(i.entry, viewer);
  const accepted = settingsFromKey(entry?.ok);
  const key = settingsKey(i.found);
  if (writer.kind === 'self') return { use: i.found, entry: { viewer, ok: key } };
  if (writer.kind === 'outsider') return { use: accepted, entry: i.entry };
  if (entry && (key === entry.ok || key === entry.sending)) return { use: i.found, entry: { viewer, ok: key } };
  const at = entry?.waiting?.found === key ? entry.waiting.at : i.now;
  const waiting: WaitingSettings = { mapId: i.mapId, found: key, at, ...(writer.name ? { by: writer.name } : {}) };
  const next: AcceptedEntry = { viewer, ...(entry?.ok ? { ok: entry.ok } : {}), waiting };
  return { use: accepted, entry: next };
}
