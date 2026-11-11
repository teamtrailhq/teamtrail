import { rmSync } from 'node:fs';
import path from 'node:path';
import type { ActivityStream } from '../activity/activityStream';
import { writeLocalJson } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import { machineAccess } from '../machine/machineAccess';
import { BRAND } from '../model/brand';
import { agentAnswerSigned } from './agentAnswerSignature';
import { agentPaths, type AgentAnswer, type AgentSessionDoc } from './agentLink';

/**
 * Persists every session of an in-process ActivityStream as a session doc and
 * feeds answers written by the Lookout back into `activity.answer`.
 */
export class AgentDocWriter {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private poll: ReturnType<typeof setInterval> | undefined;
  private off: () => void;
  private written = new Map<string, string>();
  private blocked = false;

  constructor(
    private root: string,
    private activity: ActivityStream,
    private opts: { client?: () => string | undefined; pollMs?: number } = {},
  ) {
    this.off = activity.subscribe(() => this.schedule());
    this.poll = setInterval(() => this.pullAnswers(), opts.pollMs ?? 400);
    this.poll.unref?.();
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 25);
  }

  /** Write every session whose slice changed. */
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const st = this.activity.snapshot;
    for (const session of st.sessions) {
      const sid = session.id;
      const doc: Omit<AgentSessionDoc, 'updatedAt'> = {
        v: 1,
        session,
        chats: st.chats.filter((c) => c.sessionId === sid),
        pending: st.pending.filter((q) => q.sessionId === sid),
        answered: st.answered.filter((a) => a.sessionId === sid),
        feed: st.feed.filter((f) => f.sessionId === sid).slice(-200),
        client: this.opts.client?.(),
        pid: process.pid,
      };
      const key = JSON.stringify(doc);
      if (this.written.get(sid) === key) continue;
      this.written.set(sid, key);
      writeLocalJson(this.root, agentPaths.session(sid), { ...doc, updatedAt: Date.now() });
    }
  }

  /**
   * Apply answer files for questions this process is waiting on. Only an answer signed with this machine's key
   * counts: a file written by anything else (the asking agent, a teammate's push) is removed, flagged in the
   * activity feed, and the question keeps waiting for the human. When the key can't be read (a sandbox that blocks
   * the config folder), nothing is delivered or removed, and that is said once.
   */
  pullAnswers() {
    for (const q of this.activity.snapshot.pending) {
      const file = path.join(this.root, agentPaths.answer(q.sessionId, q.id));
      const ans = readJsonFile<AgentAnswer>(file);
      if (ans) this.take(file, ans, q);
    }
  }

  private take(file: string, ans: AgentAnswer, q: { id: string; sessionId: string; agent: string }) {
    let signed: boolean;
    try {
      signed = agentAnswerSigned(this.root, ans, { sessionId: q.sessionId, questionId: q.id });
    } catch {
      return this.cannotVerify(q.sessionId);
    }
    rmSync(file, { force: true });
    // An unlabelled answer (written before labels) keeps no label: gates count it as chat (model/answerVia.ts).
    const how = { via: ans.via, chatOf: ans.via === 'chat' ? ans.chatOf : undefined };
    if (signed) return this.activity.answer(q.id, ans.text, ans.author || 'trail lead', how);
    this.activity.push({
      source: 'system',
      level: 'alert',
      sessionId: q.sessionId,
      text: `An answer file for ${q.agent}'s question was not written by ${BRAND.name} on this machine. It was ignored; the question still waits for you.`,
    });
  }

  /** Said once per process: answers wait until the config folder can be read. */
  private cannotVerify(sessionId: string) {
    if (this.blocked) return;
    this.blocked = true;
    const why = machineAccess() ?? `${BRAND.name} can't read this machine's answer key.`;
    this.activity.push({ source: 'system', level: 'alert', sessionId, text: `${why} Answers wait until it can.` });
  }

  close() {
    this.off();
    clearInterval(this.poll);
    this.flush();
  }
}
