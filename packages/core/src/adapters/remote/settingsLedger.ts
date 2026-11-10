import type { MapDoc, Ticket } from '../../model/types';
import { settingsKey, type BodySettings } from './bodySettings';
import { mapSettings, ticketSettings } from './format';
import { TrackerError } from './http';
import { settingsInForce, type AcceptedEntry, type Settled, type UnacceptedSettings } from './settingsInForce';
import type { Writer } from './writer';

/**
 * Where a machine keeps the settings it accepted per issue (acceptedSettingsFile.ts); in memory without one. The
 * only module that reads or writes the record, so moving it (to a signed, per-machine store) changes nothing else.
 */
export interface AcceptedStore {
  read(): Record<string, AcceptedEntry>;
  /**
   * Under the store's lock: `change` gets the entries as they are now and returns the ones to replace (`undefined`
   * removes one); the others are left. Never blocks the event loop; a change that can't get the lock is dropped.
   */
  /** Resolves false when the change couldn't be made (the record is locked): nothing was written. */
  update(change: (now: Record<string, AcceptedEntry>) => Record<string, AcceptedEntry | undefined>): Promise<boolean>;
}

function memoryStore(): AcceptedStore {
  const all: Record<string, AcceptedEntry> = {};
  return {
    read: () => structuredClone(all),
    async update(change) {
      for (const [id, e] of Object.entries(change(structuredClone(all)))) {
        if (e) all[id] = e;
        else delete all[id];
      }
      return true;
    },
  };
}

/** Why a confirmed write failed loudly. */
const UNRECORDED = 'Teamtrail could not record the settings you set (its record on this machine is locked)';

const same = (a: AcceptedEntry | undefined, b: AcceptedEntry | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** One read of a trail: settles each issue's settings against what is known, then saves what changed. */
export interface SettingsGate {
  settle(issueId: string, writer: Writer): (found: BodySettings) => Settled;
  save(): Promise<void>;
}

/** A remote adapter, as the attention queue asks it for settings that wait for the human. */
export interface SettingsReporter {
  unacceptedSettings(): UnacceptedSettings[];
}

export const reportsSettings = (a: object): a is SettingsReporter =>
  typeof (a as Partial<SettingsReporter>).unacceptedSettings === 'function';

/** The settings this machine accepted for the issues of one tracker target, and the writes that change them. */
export class SettingsLedger {
  /** The account the token belongs to, from the last read or asked of the tracker; entries are kept under it. */
  private viewer?: string;
  /** When a read last couldn't record what it found (the record was locked), for the attention queue. */
  skipped?: number;

  constructor(
    /** Asks the tracker who the token is, for writes made before any read. */
    private readonly whoAmI: () => Promise<string | undefined>,
    private readonly store: AcceptedStore = memoryStore(),
  ) {}

  private async me() {
    this.viewer ??= await this.whoAmI().catch(() => undefined);
    return this.viewer;
  }

  gate(o: { mapId: string; now: number; viewer: string | undefined }): SettingsGate {
    if (o.viewer) this.viewer = o.viewer;
    const known = this.store.read();
    const changed: Record<string, AcceptedEntry> = {};
    return {
      settle: (issueId, writer) => (found) => {
        const r = settingsInForce({ ...o, writer, found, entry: known[issueId] });
        if (r.entry && !same(r.entry, known[issueId])) changed[issueId] = r.entry;
        return { use: r.use, ...(r.unconfirmed ? { unconfirmed: r.unconfirmed } : {}) };
      },
      save: async () => {
        if (!Object.keys(changed).length) return;
        if (await this.store.update(() => changed)) return;
        this.skipped = o.now;
      },
    };
  }

  /** Issues whose settings in the tracker wait for the human, for the attention queue. */
  unaccepted(): UnacceptedSettings[] {
    return Object.entries(this.store.read()).flatMap(([issueId, e]) =>
      e.viewer === this.viewer && e.waiting && typeof e.waiting.found === 'string'
        ? [{ issueId, ...(e.ok ? { inForce: e.ok } : {}), waiting: e.waiting }]
        : [],
    );
  }

  /**
   * This machine writes an issue with `send`. Only the trail lead's own settings actions `confirm`: then the
   * settings it carries are in force here from now on; while it is on its way, reading them back counts as ours,
   * and a write that fails takes that back, unless another process changed the entry meanwhile. Any other write
   * (a claim, a status, an edit) leaves the record alone, so it can never make someone else's settings ours.
   */
  async write(o: { issueId: string; settings: BodySettings; send: () => Promise<unknown>; confirm: boolean }) {
    const { issueId, settings, send } = o;
    if (!o.confirm) return void (await send());
    const viewer = await this.me();
    const sending = settingsKey(settings);
    if (!viewer) throw new TrackerError('auth', 'the tracker did not say who this token is; settings not changed');
    const marked = await this.store.update((now) => ({ [issueId]: { ...now[issueId], viewer, sending } }));
    if (!marked) throw new TrackerError('invalid', `${UNRECORDED}; settings not changed`);
    try {
      await send();
    } catch (err) {
      await this.store.update((now) => {
        const e = now[issueId];
        if (e?.sending !== sending) return {};
        const { sending: _sent, ...rest } = e;
        return { [issueId]: Object.keys(rest).length > 1 ? rest : undefined };
      });
      throw err;
    }
    if (!(await this.wrote(issueId, settings))) throw new TrackerError('invalid', `${UNRECORDED} after sending them`);
  }

  writeTicket(t: Ticket, send: () => Promise<unknown>, confirm = false) {
    return this.write({ issueId: t.id, settings: ticketSettings(t), send, confirm });
  }

  writeMap(m: MapDoc, send: () => Promise<unknown>, confirm = false) {
    return this.write({ issueId: m.id, settings: mapSettings(m), send, confirm });
  }

  /**
   * The issue now holds `settings`, written by this machine. When the tracker can't say who the token is, nothing
   * is recorded: the issue's settings then wait for the human like anyone else's, rather than count unchecked.
   */
  async wrote(issueId: string, settings: BodySettings): Promise<boolean> {
    const viewer = await this.me();
    if (!viewer) return false;
    return this.store.update(() => ({ [issueId]: { viewer, ok: settingsKey(settings) } }));
  }

}
