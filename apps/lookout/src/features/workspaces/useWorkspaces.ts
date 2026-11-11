import { type IntegrationScan, type WorkspaceRecord, type WorkspaceSettings } from '@teamtrail/core';
import { useCallback, useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

/** A prepared worktree; `active` while an agent still holds its ticket. */
export type WorkspaceRow = WorkspaceRecord & { active: boolean };

export interface WorkspacesView {
  settings: WorkspaceSettings;
  errors: string[];
  exists: boolean;
  workspaces: WorkspaceRow[];
  integration: IntegrationScan;
}

export interface RemoveOutcome {
  error?: string;
  dirty?: boolean;
}

const url = `${apiBase()}/workspaces`;

async function fetchView(): Promise<WorkspacesView | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  return (await r.json()) as WorkspacesView;
}

/**
 * The project's worktree setting and the prepared worktrees, kept fresh when `workspaces.json` changes.
 * undefined while loading, null without a server (static build). `save` resolves to an error message, if any.
 */
export function useWorkspaces() {
  const [view, setView] = useState<WorkspacesView | null>();
  const { pushed } = useLiveLoad({
    load: fetchView,
    show: setView,
    failed: () => setView(null),
    changed: (p) => p.endsWith('workspaces.json') || p.includes('workspaces/') || p.includes('leases/'),
  });
  /** A reply carries the view as it is now: a load started before it is older. */
  const showReply = useCallback(
    (body: WorkspacesView) => {
      pushed();
      setView(body);
    },
    [pushed],
  );
  const save = useCallback(
    async (settings: WorkspaceSettings): Promise<string | undefined> => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const body = (await r.json()) as WorkspacesView & { error?: string };
      if (!r.ok) return body.error ?? `Saving failed (${r.status})`;
      showReply(body);
      return undefined;
    },
    [showReply],
  );
  /** Removes a finished ticket's worktree folder; `dirty` when it has uncommitted changes (retry with force). */
  const remove = useCallback(
    async (mapId: string, ticketId: string, force = false): Promise<RemoveOutcome> => {
      const r = await fetch(`${url}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapId, ticketId, force }),
      });
      const body = (await r.json()) as WorkspacesView & { error?: string; dirty?: boolean };
      if (!r.ok) return { error: body.error ?? `Removing failed (${r.status})`, dirty: body.dirty ?? false };
      showReply(body);
      return {};
    },
    [showReply],
  );
  return { view, save, remove };
}
