import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { credentialStore, writeJsonAtomic, writeLocalJson } from '@teamtrail/core/bridge';
import type { AskView } from './blocks';
import { DEFAULT_COMMAND } from './service/constants';
import type { PostedApproval } from './service/types';
import { DEFAULT_NOTIFY_EVENTS, type SlackNotify, type SlackUser } from './types';

/*
 * Everything stays on this machine, next to the tracker credentials:
 *   <config dir>/credentials.json   `slack.link`: this Teamtrail's link to the Scout service (mode 0600, shared
 *                                   with GitHub and Linear); `slack.appToken` / `slack.botToken` only from a version
 *                                   with your own Slack app, until you reconnect or remove Slack
 *   <config dir>/slack.json         non-secret settings
 *   <config dir>/slack.lock         which `teamtrail` process holds the one connection to the Scout service
 *   <tracker>/.agents/slack.json    which Slack message carries which agent question (per repo)
 */

export interface SlackConfig {
  enabled: boolean;
  workspace?: { id: string; name: string; url?: string };
  bot?: { userId: string; name?: string };
  /** Scout's Slack app id, as Slack answered for its bot: for links to Scout's Home tab. */
  appId?: string;
  /** The owner: the Slack account that went through Add Scout to Slack from this machine's Lookout. */
  owners: SlackUser[];
  allow: SlackUser[];
  notify: SlackNotify;
  command: string;
  /** Last trail used per channel, the default in the decision modal. */
  channelTrail: Record<string, string>;
}

/**
 * This Teamtrail's link to the Scout service: its id there, the token it says hello with, and the service it was
 * made with. The token is only ever sent to that service, whatever `$TEAMTRAIL_SCOUT_SERVICE` says later.
 */
export interface SlackLink {
  id: string;
  token: string;
  service: string;
}

const DEFAULTS: SlackConfig = {
  enabled: false,
  owners: [],
  allow: [],
  notify: { target: 'dm', events: DEFAULT_NOTIFY_EVENTS, detail: 'full' },
  command: DEFAULT_COMMAND,
  channelTrail: {},
};

function readJson<T>(file: string): Partial<T> {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Partial<T>;
  } catch {
    return {};
  }
}

const KEPT = ['enabled', 'workspace', 'bot', 'appId', 'owners', 'allow', 'notify', 'command', 'channelTrail'] as const;

export function slackStore(dir: string) {
  const file = path.join(dir, 'slack.json');
  const creds = credentialStore(dir);
  const read = (): SlackConfig => {
    const c = readJson<SlackConfig>(file);
    const kept = Object.fromEntries(KEPT.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
    return {
      ...DEFAULTS,
      ...kept,
      owners: c.owners ?? [],
      allow: c.allow ?? [],
      command: DEFAULT_COMMAND,
      notify: { ...DEFAULTS.notify, ...c.notify },
      channelTrail: { ...c.channelTrail },
    };
  };
  return {
    file,
    read,
    write(c: SlackConfig) {
      writeJsonAtomic(file, c);
    },
    update(patch: Partial<SlackConfig>) {
      const next = { ...read(), ...patch };
      writeJsonAtomic(file, next);
      return next;
    },
    link(): SlackLink | undefined {
      const l = creds.read().slack?.link;
      return l?.id && l.token ? { id: l.id, token: l.token, service: l.service ?? '' } : undefined;
    },
    /** Tokens of your own Slack app, from a version before Scout was one app; never used, only removed. */
    legacy(): boolean {
      const s = creds.read().slack;
      return !!(s?.appToken || s?.botToken) && !s?.link;
    },
    /** A new link replaces everything Slack kept in the credential store, an old app's tokens included. */
    saveLink(link: SlackLink) {
      creds.update((c) => ({ ...c, slack: { link } }));
    },
    /** Remove: the link (or an old app's tokens) and the settings. */
    clear() {
      creds.update((c) => {
        const { slack: _gone, ...rest } = c;
        return rest;
      });
      rmSync(file, { force: true });
    },
  };
}
export type SlackStore = ReturnType<typeof slackStore>;

function alive(pid: number) {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * One process per machine holds the link to the Scout service: the service sends this Teamtrail's Slack events to
 * whichever of its sockets is open, so two processes would each get some. `owner` identifies this process (tests
 * run several in one pid).
 */
export function slackLock(dir: string, owner: string) {
  const file = path.join(dir, 'slack.lock');
  type Lock = { pid: number; owner: string; root: string; at: number };
  const current = () => {
    const l = readJson<Lock>(file) as Lock;
    return l.pid && alive(l.pid) ? l : undefined;
  };
  return {
    /** Takes the lock; returns the holder's tracker folder when another live process has it. */
    acquire(root: string): { ok: true } | { ok: false; heldBy: string } {
      const l = current();
      if (l && l.owner !== owner) return { ok: false, heldBy: l.root };
      writeJsonAtomic(file, { pid: process.pid, owner, root, at: Date.now() } satisfies Lock);
      return { ok: true };
    },
    /** The tracker folder of another live process that holds the connection, if one does. */
    elsewhere(): string | undefined {
      const l = current();
      return l && l.owner !== owner ? l.root : undefined;
    },
    release() {
      if (current()?.owner === owner) rmSync(file, { force: true });
    },
  };
}

export interface AskRecord {
  sessionId: string;
  channel: string;
  ts: string;
  /** Set once the message shows the outcome and lost its buttons. */
  closed?: boolean;
  /** Answered from Slack: who and what, for the closing line. */
  by?: { user: string; text: string };
  /** What the message shows, to re-render it without the buttons. Stays on this machine. */
  view?: AskView & { mapId: string; ticketId?: string; at: number };
}

const ASKS_FILE = '.agents/slack.json';
const APPROVALS_FILE = '.agents/slack-approvals.json';

export function askStore(root: string) {
  const file = path.join(root, ASKS_FILE);
  return {
    read: (): Record<string, AskRecord> =>
      (readJson<{ asks: Record<string, AskRecord> }>(file).asks ?? {}) as Record<string, AskRecord>,
    write: (asks: Record<string, AskRecord>) => writeLocalJson(root, ASKS_FILE, { asks }),
  };
}

/**
 * Approval messages Scout posted, by trail/ticket/attempt/kind, in the tracker
 * folder (`.agents/slack-approvals.json`), so a restart updates them instead of
 * posting again. Stays on this machine.
 */
export function approvalStore(root: string) {
  const file = path.join(root, APPROVALS_FILE);
  return {
    read: (): Record<string, PostedApproval> =>
      (readJson<{ approvals: Record<string, PostedApproval> }>(file).approvals ?? {}) as Record<string, PostedApproval>,
    write: (approvals: Record<string, PostedApproval>) => writeLocalJson(root, APPROVALS_FILE, { approvals }),
  };
}
