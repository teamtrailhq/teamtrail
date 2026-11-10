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
  /** The settings in force: the last ones this machine wrote, read from its own account, or first found. */
  ok?: string;
  /** Settings this machine is writing right now; reading them back confirms the write. */
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
  mapId: string;
  now: number;
}

const settled = (key: string, entry: AcceptedEntry | undefined): AcceptedEntry =>
  entry?.sending && entry.sending !== key ? { ok: key, sending: entry.sending } : { ok: key };

/**
 * Which settings apply to an issue, and what to remember about it. The body's own are taken when this account
 * wrote the body, when they are what this machine last put or accepted, or when a teammate wrote them and this
 * machine sees the issue for the first time. Anything else leaves the accepted settings in force and is kept as
 * waiting, for the human to look at. An outsider's are never taken.
 */
export function settingsInForce(i: Input): { use: BodySettings; entry: AcceptedEntry | undefined } {
  const { writer, entry } = i;
  if (writer.kind === 'outsider') return { use: settingsFromKey(entry?.ok), entry };
  const key = settingsKey(i.found);
  // Nothing accepted yet: this machine sees the issue for the first time, and takes it as it stands.
  if (!entry || entry.ok === undefined) return { use: i.found, entry: settled(key, entry) };
  const known = key === entry.ok || key === entry.sending;
  if (writer.kind === 'self' || known) return { use: i.found, entry: settled(key, entry) };
  const at = entry.waiting?.found === key ? entry.waiting.at : i.now;
  const waiting: WaitingSettings = { mapId: i.mapId, found: key, at, ...(writer.name ? { by: writer.name } : {}) };
  return { use: settingsFromKey(entry.ok), entry: { ...entry, waiting } };
}
