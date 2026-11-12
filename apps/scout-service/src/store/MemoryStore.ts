import type { Link, PendingCode, PendingInstall, ServiceStore, Workspace } from '../types';

/** Everything in memory: for tests and local development. A restart forgets every install and link. */
export class MemoryStore implements ServiceStore {
  private workspaces = new Map<string, Workspace>();
  private links = new Map<string, Link>();
  private installs = new Map<string, PendingInstall>();
  private codes = new Map<string, PendingCode>();

  async saveWorkspace(w: Workspace) {
    this.workspaces.set(w.teamId, { ...w });
  }

  async workspace(teamId: string) {
    const w = this.workspaces.get(teamId);
    return w && { ...w };
  }

  async removeWorkspace(teamId: string) {
    this.workspaces.delete(teamId);
    const removed = [...this.links.values()].filter((l) => l.teamId === teamId).map((l) => l.id);
    for (const id of removed) this.links.delete(id);
    return removed;
  }

  async saveLink(l: Link) {
    this.links.set(l.id, { ...l });
  }

  async link(id: string) {
    const l = this.links.get(id);
    return l && { ...l };
  }

  async linkByTokenHash(hash: string) {
    const l = [...this.links.values()].find((x) => x.tokenHash === hash);
    return l && { ...l };
  }

  async linksOf(teamId: string, userId: string) {
    return [...this.links.values()]
      .filter((l) => l.teamId === teamId && l.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((l) => ({ ...l }));
  }

  async removeLink(id: string) {
    this.links.delete(id);
  }

  async touchLink(id: string, at: number) {
    const l = this.links.get(id);
    if (l) l.lastSeenAt = at;
  }

  async saveInstall(p: PendingInstall) {
    this.installs.set(p.stateHash, { ...p });
  }

  async takeInstall(stateHash: string, now: number) {
    const p = this.installs.get(stateHash);
    this.installs.delete(stateHash);
    return p && p.expiresAt > now ? p : undefined;
  }

  async saveCode(c: PendingCode) {
    this.codes.set(c.codeHash, { ...c });
  }

  async takeCode(codeHash: string, now: number) {
    const c = this.codes.get(codeHash);
    this.codes.delete(codeHash);
    return c && c.expiresAt > now ? c : undefined;
  }

  async purge(now: number) {
    for (const [k, p] of this.installs) if (p.expiresAt <= now) this.installs.delete(k);
    for (const [k, c] of this.codes) if (c.expiresAt <= now) this.codes.delete(k);
  }

  async close() {}
}
