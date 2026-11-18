import { LOOKOUT_MODES, type LookoutMode, webUrl } from '@teamtrail/core';
import { managedPages, type ManagedPage } from './managedPages';
import { applyTheme, type ThemeChoice } from './theme';

const THEMES: ThemeChoice[] = ['auto', 'day', 'night'];

/** The server's agents page, kept only on this origin (managedPages.ts). */
function agentsOf(value: unknown): { agents?: ManagedPage } {
  const [page] = managedPages(value ? [value] : [], location.origin);
  return page ? { agents: page } : {};
}

/** A path on this origin only, as the server's places to save or act are. */
const pathOf = (value: unknown) => (typeof value === 'string' && /^\/[\w/-]{1,100}$/.test(value) ? value : undefined);

/** Where the server saves the theme. */
function themeSaveOf(value: unknown): { themeSave?: string } {
  const p = pathOf(value);
  return p ? { themeSave: p } : {};
}

/** This person's Hands-off or Hands-on as the server keeps it, and where it saves another. */
function modeOf(value: unknown, save: unknown): { mode?: LookoutMode; modeSave?: string } {
  const mode = LOOKOUT_MODES.find((m) => m === value);
  const p = pathOf(save);
  return { ...(mode ? { mode } : {}), ...(p ? { modeSave: p } : {}) };
}

/** Where the server says what it merged by itself (lib/autoMerge.ts). */
function autoMergeOf(value: unknown): { autoMerge?: string } {
  const p = pathOf(value);
  return p ? { autoMerge: p } : {};
}

/** Where the server starts and pauses agents on a trail. */
function trailAgentsOf(value: unknown): { trailAgents?: string } {
  const p = pathOf(value);
  return p ? { trailAgents: p } : {};
}

/** Where the server says how far setup is. */
function setupOf(value: unknown): { setup?: string } {
  const p = pathOf(value);
  return p ? { setup: p } : {};
}

/** Where the server merges an approved ticket's pull request. */
function mergeOf(value: unknown): { merge?: string } {
  const p = pathOf(value);
  return p ? { merge: p } : {};
}

/** The server's home link, kept only as a short label and an http(s) URL. */
function homeOf(value: unknown): { home?: { label: string; href: string } } {
  const h = value as { label?: unknown; href?: unknown } | undefined;
  if (typeof h?.label !== 'string' || !h.label.trim() || h.label.length > 60 || typeof h.href !== 'string') return {};
  const href = webUrl(h.href);
  return href ? { home: { label: h.label.trim(), href } } : {};
}

/**
 * Sign-in managed by the server the Lookout runs behind (core signIn/externalSignIn.ts): `GET /session` says
 * `managed` instead of asking to pair. Then there is no session in this page, nothing to prove, and event streams
 * open as they are: the server in front signs every request in itself.
 */
export interface ManagedSignIn {
  /** Who the server says is signed in. */
  name: string;
  /** Where signing out happens, on this origin; none when the server offers no page for it. */
  signOut?: string;
  /** The server's own pages for this person (who is in the workspace, say), on this origin. */
  pages: ManagedPage[];
  /** The theme this person picked on the server: the Lookout follows it in place of its own setting. */
  theme?: ThemeChoice;
  /**
   * Where the server saves this person's theme (a path on this origin): the Lookout's own theme controls then change
   * it there (managedTheme.ts). Without it, a server theme is fixed here.
   */
  themeSave?: string;
  /**
   * Where the server merges a finished ticket's pull request once a person approves it here (a path on this origin):
   * the Proof section then offers Approve and merge on a verified ticket (features/proof/MergeOnApprove.tsx).
   */
  merge?: string;
  /**
   * Where the server says how far this person is with setting up (a path on this origin): Scout's Get started guide
   * in the corner reads it (features/guide/), until every step is done.
   */
  setup?: string;
  /**
   * Where the server starts and pauses this person's agents on a trail (a path on this origin): New trail and the
   * trail's header then offer Start the trail in place (features/trail/StartTrail.tsx).
   */
  trailAgents?: string;
  /**
   * This person's Hands-off or Hands-on, as the server keeps it: it wins over the Lookout's own preference
   * (lib/lookoutMode.ts). Missing: the Lookout's preference on this machine.
   */
  mode?: LookoutMode;
  /**
   * Where the server saves this person's mode (a path on this origin): the switch then posts `{ mode }` there as JSON.
   * Without it, a mode picked here is kept in the Lookout's own preference.
   */
  modeSave?: string;
  /**
   * The server merges verified pull requests by itself: where it says what it merged (a path on this origin;
   * `GET <path>?since=<ms>&trail=<id>` gives `{ on, merged, settings, … }`, lib/autoMerge.ts). Hands-off's footer
   * then says how many it merged today and links to its setting.
   */
  autoMerge?: string;
  /** `false`: this person may not make high-risk calls, so the page routes those to someone who may. */
  highRisk?: boolean;
  /** The server's own home (all of this person's workspaces, say), on any web origin: a way out of the Lookout. */
  home?: { label: string; href: string };
  /**
   * The server keeps the trails itself (`markdown`, in its own storage): no tracker to choose or connect here, so the
   * first run asks nothing and Settings → Tracker says so.
   */
  tracker?: 'markdown';
  /**
   * The server runs agents itself: the page (on this origin) where people turn them on for a trail. The Lookout then
   * points there instead of offering `/scout` commands for an agent of their own.
   */
  agents?: ManagedPage;
}

let managed: ManagedSignIn | undefined;

/** The managed sign-in this page learned from `GET /session`, if any. */
export const managedSignIn = () => managed;

/** Read from a `GET /session` reply: kept only when it is well formed; its sign-out and pages only on this origin. */
export function learnManagedSignIn(reply: { managed?: unknown }) {
  const m = reply.managed as Record<string, unknown> | undefined;
  if (!m || typeof m.name !== 'string') return undefined;
  const sameOrigin = typeof m.signOut === 'string' && new URL(m.signOut, location.href).origin === location.origin;
  const pages = managedPages(m.pages, location.origin);
  const theme = THEMES.find((t) => t === m.theme);
  managed = {
    name: m.name,
    pages,
    ...(sameOrigin ? { signOut: m.signOut as string } : {}),
    ...(theme ? { theme } : {}),
    ...themeSaveOf(m.themeSave),
    ...mergeOf(m.merge),
    ...modeOf(m.mode, m.modeSave),
    ...autoMergeOf(m.autoMerge),
    ...setupOf(m.setup),
    ...trailAgentsOf(m.trailAgents),
    ...(m.highRisk === false ? { highRisk: false } : {}),
    ...homeOf(m.home),
    ...(m.tracker === 'markdown' ? { tracker: 'markdown' as const } : {}),
    ...agentsOf(m.agents),
  };
  if (theme) applyTheme(theme);
  return managed;
}
