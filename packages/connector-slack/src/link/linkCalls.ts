import { SlackApiError } from '../api';

type Pending = { method: string; resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: unknown };

/** Slack calls sent over the link and waiting for the service's `result`, by id. */
export class LinkCalls {
  private seq = 0;
  private pending = new Map<string, Pending>();

  constructor(private timeoutMs: number) {}

  /** A new call's id and the promise its result settles. */
  open(method: string): { id: string; result: Promise<unknown> } {
    const id = `c${++this.seq}`;
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(id, 'timeout'), this.timeoutMs);
      (timer as { unref?: () => void }).unref?.();
      this.pending.set(id, { method, resolve, reject, timer });
    });
    return { id, result };
  }

  settle(m: { id: string; ok: boolean; response?: unknown; error?: string }) {
    const p = this.take(m.id);
    if (!p) return;
    if (m.ok) p.resolve(m.response);
    else p.reject(new SlackApiError(m.error ?? 'failed', p.method));
  }

  fail(id: string, code: string) {
    const p = this.take(id);
    p?.reject(new SlackApiError(code, p.method));
  }

  /** The socket closed: nothing sent on it will be answered. */
  failAll(code: string) {
    for (const id of [...this.pending.keys()]) this.fail(id, code);
  }

  private take(id: string) {
    const p = this.pending.get(id);
    if (!p) return undefined;
    clearTimeout(p.timer as ReturnType<typeof setTimeout>);
    this.pending.delete(id);
    return p;
  }
}
