import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { BRAND } from '@teamtrail/core';
import { credentialStore, writeJsonAtomic } from '@teamtrail/core/bridge';
import type { AskView } from './blocks';
import { DEFAULT_COMMAND } from './manifest';
import { settleOwners, type OwnerRedo, type PendingOwner } from './owners';
import type { PostedApproval } from './service/types';
import { DEFAULT_NOTIFY_EVENTS, type SlackNotify, type SlackTokenSource, type SlackUser } from './types';

/*
 * Everything stays on this machine, next to the tracker credentials:
 *   <config dir>/credentials.json   `slack.appToken` / `slack.botToken` (mode 0600, shared with GitHub and Linear)
 *   <config dir>/slack.json         non-secret settings and setup progress
 *   <config dir>/slack.lock         which `teamtrail` process owns the one Socket Mode connection
 *   <tracker>/.agents/slack.json    which Slack message carries which agent question (per repo)
 */

export interface SlackConfig {
  enabled: boolean;
  /** Step 1 done: the user opened Slack's create-from-manifest page. */
  created: boolean;
  appId?: string;
  workspace?: { id: string; name: string; url: string };
  bot?: { userId: string; name?: string };
  /** The confirmed owner; see `settleOwners` for what an earlier version saved here. */
  owners: SlackUser[];
  /** A Slack account put forward as the owner, until the trail lead confirms or refuses it. */
  pendingOwner?: PendingOwner;
  /** Read only: an owner from an earlier version that was dropped (`settleOwners`). */
  ownerRedo?: OwnerRedo;
  allow: SlackUser[];
  notify: SlackNotify;
  command: string;
  /** Last trail used per channel, the default in the decision modal. */
  channelTrail: Record<string, string>;
}

const DEFAULTS: SlackConfig = {
  enabled: false,
  created: false,
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

type Env = Record<string, string | undefined>;
const ENV = {
  app: `${BRAND.slug.toUpperCase()}_SLACK_APP_TOKEN` as SlackTokenSource,
  bot: `${BRAND.slug.toUpperCase()}_SLACK_BOT_TOKEN` as SlackTokenSource,
};

export function slackStore(dir: string, env: Env = process.env) {
  const file = path.join(dir, 'slack.json');
  const creds = credentialStore(dir);
  const read = (): SlackConfig => {
    const c = readJson<SlackConfig>(file);
    return {
      ...DEFAULTS,
      ...c,
      ...settleOwners(c),
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
    /** Saved tokens first, then $TEAMTRAIL_SLACK_APP_TOKEN / $TEAMTRAIL_SLACK_BOT_TOKEN. */
    tokens(): { app?: { token: string; source: SlackTokenSource }; bot?: { token: string; source: SlackTokenSource } } {
      const s = creds.read().slack ?? {};
      const pick = (stored: string | undefined, name: SlackTokenSource) => {
        if (stored) return { token: stored, source: 'stored' as const };
        const fromEnv = env[name];
        if (fromEnv) return { token: fromEnv, source: name };
        return undefined;
      };
      return { app: pick(s.appToken, ENV.app), bot: pick(s.botToken, ENV.bot) };
    },
    saveToken(kind: 'app' | 'bot', token: string) {
      const c = creds.read();
      creds.write({ ...c, slack: { ...c.slack, [kind === 'app' ? 'appToken' : 'botToken']: token } });
    },
    /** Remove: tokens and settings. */
    clear() {
      const c = creds.read();
      delete c.slack;
      creds.write(c);
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
 * Slack spreads events across all of an app's open sockets, so exactly one
 * process per machine connects. `owner` identifies this process (tests run several in one pid).
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

export function askStore(root: string) {
  const file = path.join(root, '.agents', 'slack.json');
  return {
    read: (): Record<string, AskRecord> =>
      (readJson<{ asks: Record<string, AskRecord> }>(file).asks ?? {}) as Record<string, AskRecord>,
    write: (asks: Record<string, AskRecord>) => writeJsonAtomic(file, { asks }),
  };
}

/**
 * Approval messages Scout posted, by trail/ticket/attempt/kind, in the tracker
 * folder (`.agents/slack-approvals.json`), so a restart updates them instead of
 * posting again. Stays on this machine.
 */
export function approvalStore(root: string) {
  const file = path.join(root, '.agents', 'slack-approvals.json');
  return {
    read: (): Record<string, PostedApproval> =>
      (readJson<{ approvals: Record<string, PostedApproval> }>(file).approvals ?? {}) as Record<string, PostedApproval>,
    write: (approvals: Record<string, PostedApproval>) => writeJsonAtomic(file, { approvals }),
  };
}
