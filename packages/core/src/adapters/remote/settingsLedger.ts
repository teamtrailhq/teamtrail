import type { MapDoc, Ticket } from '../../model/types';
import { settingsKey, type BodySettings } from './bodySettings';
import { mapSettings, ticketSettings } from './format';
import { settingsInForce, type AcceptedEntry, type UnacceptedSettings } from './settingsInForce';
import type { Writer } from './writer';

/** Where a machine keeps the settings it accepted per issue (acceptedSettingsFile.ts); in memory without one. */
export interface AcceptedStore {
  read(): Record<string, AcceptedEntry>;
  /** Replaces the given entries, leaving the others. */
  put(entries: Record<string, AcceptedEntry>): void;
}

function memoryStore(): AcceptedStore {
  const all: Record<string, AcceptedEntry> = {};
  return { read: () => ({ ...all }), put: (entries) => void Object.assign(all, entries) };
}

const same = (a: AcceptedEntry | undefined, b: AcceptedEntry | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** One read of a trail: settles each issue's settings against what is known, then saves what changed. */
export interface SettingsGate {
  settle(issueId: string, writer: Writer): (found: BodySettings) => BodySettings;
  save(): void;
}

/** A remote adapter, as the attention queue asks it for settings that wait for the human. */
export interface SettingsReporter {
  unacceptedSettings(): UnacceptedSettings[];
}

export const reportsSettings = (a: object): a is SettingsReporter =>
  typeof (a as Partial<SettingsReporter>).unacceptedSettings === 'function';

/** The settings this machine accepted for the issues of one tracker target, and the writes that change them. */
export class SettingsLedger {
  constructor(private readonly store: AcceptedStore = memoryStore()) {}

  gate(mapId: string, now: number): SettingsGate {
    const known = this.store.read();
    const changed: Record<string, AcceptedEntry> = {};
    return {
      settle: (issueId, writer) => (found) => {
        const r = settingsInForce({ writer, found, entry: known[issueId], mapId, now });
        if (r.entry && !same(r.entry, known[issueId])) changed[issueId] = r.entry;
        return r.use;
      },
      save: () => {
        if (Object.keys(changed).length) this.store.put(changed);
      },
    };
  }

  /** Issues whose settings in the tracker wait for the human, for the attention queue. */
  unaccepted(): UnacceptedSettings[] {
    return Object.entries(this.store.read()).flatMap(([issueId, e]) =>
      e.waiting && typeof e.waiting.found === 'string' ? [{ issueId, inForce: e.ok ?? '{}', waiting: e.waiting }] : [],
    );
  }

  /** This machine writes `settings` into an issue with `send`; they are in force here from then on. */
  async write(issueId: string, settings: BodySettings, send: () => Promise<unknown>) {
    const key = settingsKey(settings);
    this.store.put({ [issueId]: { ...this.store.read()[issueId], sending: key } });
    await send();
    this.wrote(issueId, settings);
  }

  writeTicket(t: Ticket, send: () => Promise<unknown>) {
    return this.write(t.id, ticketSettings(t), send);
  }

  writeMap(m: MapDoc, send: () => Promise<unknown>) {
    return this.write(m.id, mapSettings(m), send);
  }

  /** The issue now holds `settings`, written by this machine. */
  wrote(issueId: string, settings: BodySettings) {
    this.store.put({ [issueId]: { ok: settingsKey(settings) } });
  }
}
