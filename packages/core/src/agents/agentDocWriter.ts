import { rmSync } from 'node:fs';
import path from 'node:path';
import type { ActivityStream } from '../activity/activityStream';
import type { NotUsedAnswer } from '../activity/notUsedAnswer';
import { writeLocalJson } from '../lib/ensureLocalDir';
import { machineAccess } from '../machine/machineAccess';
import { BRAND } from '../model/brand';
import { compareVersions } from '../model/compareVersions';
import { runningVersion } from '../model/runningVersion';
import type { AnsweredQuestion } from '../model/types';
import { versionSkew } from '../model/versionSkew';
import { ANSWER_FORMAT, agentPaths, type AgentSessionDoc } from './agentLink';
import { signAnswered } from './answeredSignature';
import { answerFiles, type AnswerFile } from './answerFiles';
import { verified, type Asked, type Signed } from './verifiedAnswer';

/** How long answers that come in after the one delivered are still kept with the question. */
const LATE_MS = 60_000;
const TRAIL_LEAD = 'trail lead';

/** A question answered here lately: until when later answers are kept, and the files already kept, by number. */
type Late = { q: Asked; until: number; kept: Set<number> };

const teamtrailVersion = () => {
  const v = runningVersion();
  return v ? { teamtrail: v } : {};
};

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
  private toldSkew = false;
  private signatures = new Map<string, AnsweredQuestion>();
  /** Questions answered here lately, with the answer files already kept, by number. */
  private late = new Map<string, Late>();
  /** Numbered answer files already flagged as not Teamtrail's. */
  private flagged = new Set<string>();

  constructor(
    private root: string,
    private activity: ActivityStream,
    private opts: {
      client?: () => string | undefined;
      pollMs?: number;
      /** Answers kept as not used (`ActivityStream.notUsed`), for the asking agent's own records. */
      onNotUsed?: (q: { sessionId: string; questionId: string }, answers: NotUsedAnswer[]) => void;
    } = {},
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

  /** The answered entry signed, once per entry: it was delivered from a verified answer in this process. */
  private signed(a: AnsweredQuestion) {
    const key = JSON.stringify(a);
    let s = this.signatures.get(key);
    if (!s) this.signatures.set(key, (s = signAnswered(this.root, a)));
    return s;
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
        answered: st.answered.filter((a) => a.sessionId === sid).map((a) => this.signed(a)),
        feed: st.feed.filter((f) => f.sessionId === sid).slice(-200),
        client: this.opts.client?.(),
        ...teamtrailVersion(),
        answerFormat: ANSWER_FORMAT,
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
   * counts: a file written by anything else (the asking agent, a teammate's push) is flagged in the activity feed
   * and passed over, and the question keeps waiting for the human. The first answer in line that verifies
   * (answerFiles.ts) is delivered; answers after it are kept in the conversation as not used, also those that come
   * in for a minute after (`pullLate`). When the key can't be read (a sandbox that blocks the config folder),
   * nothing is delivered, and that is said once.
   */
  pullAnswers() {
    // Before new deliveries: an answer delivered now is in the asking agent's hands before its later ones are kept.
    this.pullLate();
    for (const q of this.activity.snapshot.pending) this.pullFor(q);
  }

  private pullFor(q: Asked) {
    for (const f of answerFiles(this.root, q.sessionId, q.id)) {
      const r = this.judge(f, q);
      if (r.kind === 'wait') return;
      if (r.kind === 'skip') continue;
      if (f.seq === 0) rmSync(f.file, { force: true });
      // An unlabelled answer (an older writer, or a label that doesn't verify) counts as chat at gates (answerVia.ts).
      if (this.activity.answer(q.id, r.ans.text, r.ans.author || TRAIL_LEAD, r.how))
        this.late.set(q.id, { q, until: Date.now() + LATE_MS, kept: new Set([f.seq]) });
      return;
    }
  }

  /** Answers given to a question after the one delivered: kept, marked not used, never delivered. */
  private pullLate() {
    for (const [id, l] of this.late) {
      if (Date.now() <= l.until) this.keepLater(l);
      else {
        this.late.delete(id);
        rmSync(path.join(this.root, agentPaths.answerDir(l.q.sessionId, id)), { recursive: true, force: true });
      }
    }
  }

  private keepLater(l: Late) {
    const later = answerFiles(this.root, l.q.sessionId, l.q.id)
      .filter((f) => !l.kept.has(f.seq))
      .map((f) => ({ f, r: verified(this.root, f, l.q) }))
      .filter((x): x is { f: AnswerFile; r: Signed } => x.r.kind === 'signed');
    if (!later.length) return;
    for (const { f } of later) {
      if (f.seq === 0) rmSync(f.file, { force: true });
      else l.kept.add(f.seq);
    }
    const answers = later.map(({ r }) => ({ text: r.ans.text, author: r.ans.author || TRAIL_LEAD, how: r.how }));
    if (this.activity.notUsed(l.q.id, answers))
      this.opts.onNotUsed?.({ sessionId: l.q.sessionId, questionId: l.q.id }, answers);
  }

  /** What to do with one answer file of a question still waiting: deliver it, pass over it, or wait. */
  private judge(f: AnswerFile, q: Asked): Signed | { kind: 'wait' } | { kind: 'skip' } {
    const r = verified(this.root, f, q);
    switch (r.kind) {
      case 'signed':
        return r;
      case 'skip':
        return { kind: 'skip' };
      case 'unreadable':
        this.cannotVerify(q.sessionId);
        return { kind: 'wait' };
      case 'forged':
        // A newer Teamtrail may sign in a way this one doesn't know: keep the answer and say why, never call it forged.
        if (this.newerWriter(f.ans?.writer)) {
          this.skewed(q.sessionId, f.ans!.writer!);
          return { kind: 'wait' };
        }
        this.forged(f, q);
        return { kind: 'skip' };
      default:
        return r satisfies never;
    }
  }

  /** Said once per file: a forged single file (the old layout) is removed, a numbered one only passed over. */
  private forged(f: AnswerFile, q: Asked) {
    if (f.seq === 0) rmSync(f.file, { force: true });
    if (this.flagged.has(f.file)) return;
    if (f.seq > 0) this.flagged.add(f.file);
    this.activity.push({
      source: 'system',
      level: 'alert',
      kind: 'problem',
      sessionId: q.sessionId,
      text: `An answer file for ${q.agent}'s question was not written by ${BRAND.name} on this machine. It was ignored; the question still waits for you.`,
    });
  }

  private newerWriter(writer: unknown) {
    const own = runningVersion();
    return typeof writer === 'string' && !!own && compareVersions(writer, own) > 0;
  }

  /** Said once per process: the answer stays for an agent on the Lookout's version to read. */
  private skewed(sessionId: string, writer: string) {
    if (this.toldSkew) return;
    this.toldSkew = true;
    const text = versionSkew({ agentVersion: runningVersion(), lookoutVersion: writer });
    this.activity.push({
      source: 'system',
      level: 'alert',
      kind: 'problem',
      sessionId,
      text: `An answer waits that this agent can't read. ${text}`,
    });
  }

  /** Said once per process: answers wait until the config folder can be read. */
  private cannotVerify(sessionId: string) {
    if (this.blocked) return;
    this.blocked = true;
    const why = machineAccess() ?? `${BRAND.name} can't read this machine's answer key.`;
    this.activity.push({
      source: 'system',
      level: 'alert',
      kind: 'problem',
      sessionId,
      text: `${why} Answers wait until it can.`,
    });
  }

  close() {
    this.off();
    clearInterval(this.poll);
    this.flush();
  }
}
