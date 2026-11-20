import { ago, dur, hhmm } from '../../lib/format';
import { needAction } from './needAction';
import type { Standing, StandingInput } from './types';

/**
 * Where a ticket stands, in one line of plain words, and the one thing the human can do next: who has it and since
 * when, or what it waits on. Pure: the same input always reads the same.
 */
export function ticketStanding(s: StandingInput): Standing {
  const standing = standingOf(s);
  const calm = standing.edge === 'neutral' || standing.edge === 'done';
  return s.atRisk && calm ? { ...standing, edge: 'attention' } : standing;
}

function standingOf(s: StandingInput): Standing {
  if (s.question) return asked(s, s.question);
  if (s.outsideChange)
    return {
      edge: 'attention',
      title: 'Held: changed outside Teamtrail',
      parts: [s.outsideChange],
      primary: 'review-change',
    };
  const asking = itemAsked(s);
  if (asking) return asking;
  if (s.running && s.state !== 'decided' && s.state !== 'out-of-scope')
    return {
      edge: 'neutral',
      title: `Checking ${s.running.agent}'s work`,
      parts: [`since ${hhmm(s.running.startedAt)}`],
    };
  switch (s.state) {
    case 'decided':
      return done(s);
    case 'out-of-scope':
      return { edge: 'neutral', title: 'Ruled out', parts: closed(s) };
    case 'verifying':
      return verifying(s);
    case 'held':
      return held(s);
    case 'claimed':
      return working(s);
    case 'rework':
      return { edge: 'attention', title: `Rework: ${whyBack(s)}`, parts: ['waits for an agent'] };
    case 'frontier':
      return ready(s);
    case 'blocked':
      return { edge: 'neutral', title: `Waits on ${s.openBlockers.join(', ')}`, parts: [] };
    case 'parked':
      return { edge: 'neutral', title: 'Parked', parts: ['a plan-only trail builds nothing'] };
    default: {
      const never: never = s.state;
      return never;
    }
  }
}

function held(s: StandingInput): Standing {
  const edge = s.item?.edge ?? 'attention';
  const retried = s.latest?.retried;
  // the checks passed, but the work changed what they run: the way past is accepting the pass, or sending it back
  // (when it also passed only on retry, that is said too: one accept counts it past both)
  if (s.latest?.guarded)
    return {
      edge,
      title: 'Held: the work changed what its checks run',
      parts: [s.latest.guarded, ...(retried ? [`only on retry: ${retried}`] : []), 'waits on you'],
      primary: 'accept',
    };
  // a pass only a retry got: the human counts it or sends it back to fix the flaky test
  if (retried) return { edge, title: 'Held: passed only on retry', parts: [retried], primary: 'rework' };
  return {
    edge,
    title: `Blocked: ${whyBack(s)}`,
    parts: ['waits on you'],
    // a check that can't pass: the way out is accepting it without that check
    primary: s.latest?.failed.length ? 'waive' : 'unblock',
  };
}

/** An open question: its headline as the title, who asks, and the question in full under it when it says more. */
function asked(s: StandingInput, q: NonNullable<StandingInput['question']>): Standing {
  const edge = s.item?.kind === 'question' ? s.item.edge : 'urgent';
  if (!q.headline)
    return {
      edge,
      title: `Waiting on you: answer ${q.agent}'s question`,
      parts: [since(s.now, q.at)],
      primary: 'answer',
    };
  return {
    edge,
    title: `Waiting on you: ${q.headline}`,
    parts: [`${q.agent} asks`, since(s.now, q.at)],
    primary: 'answer',
    ...(q.body ? { body: q.body } : {}),
  };
}

function done(s: StandingInput): Standing {
  const proof = proofWord(s.verified);
  const finished = s.closedAt && `finished ${since(s.now, s.closedAt)}`;
  return { edge: 'done', title: 'Done', parts: [proof, finished].filter((p): p is string => !!p) };
}

function proofWord(verified?: boolean) {
  if (verified === undefined) return undefined;
  return verified ? 'verified' : 'not verified';
}

function closed(s: StandingInput) {
  return s.closedAt ? [since(s.now, s.closedAt)] : [];
}

function verifying(s: StandingInput): Standing {
  if (s.item?.kind === 'approval')
    return { edge: s.item.edge, title: 'Waiting on you: approve it', parts: passed(s), primary: 'approve' };
  if (s.reviewWaits) return { edge: 'neutral', title: 'Waiting for a review agent', parts: passed(s) };
  return { edge: 'neutral', title: 'Verifying', parts: [] };
}

function passed(s: StandingInput) {
  return s.latest?.result === 'pass' ? ['checks passed'] : [];
}

/** Why a ticket came back: its checks, else the review's verdict. */
function whyBack(s: StandingInput) {
  const failed = s.latest?.failed.length ? ` (${s.latest.failed.join(', ')})` : '';
  if (s.latest?.result === 'fail') return `checks failed${failed}`;
  if (s.latest?.result === 'error') return `checks could not run${failed}`;
  if (s.latest?.result === 'interrupted') return 'checks were interrupted';
  return s.sentBack ?? 'sent back';
}

function working(s: StandingInput): Standing {
  const lease = s.lease;
  if (lease && lease.health !== 'live') {
    const left =
      lease.health === 'expired' ? 'going back to the queue' : `back in the queue in ${dur(lease.expiresAt - s.now)}`;
    const parts = [`active ${since(s.now, lease.renewedAt)}`, left];
    return { edge: 'attention', title: `${lease.agent} went quiet`, parts, primary: 'release' };
  }
  if (s.mine) return { edge: 'neutral', title: 'You have it', parts: [], primary: 'resolve' };
  const who = lease?.agent ?? s.assignee ?? 'An agent';
  return {
    edge: 'neutral',
    title: `${who} is working on it`,
    parts: lease ? [`active ${since(s.now, lease.renewedAt)}`] : [],
  };
}

function ready(s: StandingInput): Standing {
  if (s.briefHeld === 'submitted')
    return {
      edge: 'attention',
      title: 'Held: waits on the brief',
      parts: ['the brief waits on you'],
      primary: 'review-brief',
    };
  if (s.briefHeld)
    return { edge: 'attention', title: 'Held: waits on the brief', parts: ['research is still writing it'] };
  if (s.hitl) {
    const model = s.modelWait && `agents need a ${s.modelWait.tier} model`;
    const parts = ['decide it yourself, or let an agent ask you', model].filter((p): p is string => !!p);
    return { edge: s.item?.edge ?? 'neutral', title: 'Ready: needs a person', parts, primary: 'resolve' };
  }
  if (s.modelWait)
    return {
      edge: 'attention',
      title: `Waits for a ${s.modelWait.tier} model`,
      parts: [`connected agents run ${s.modelWait.best} at most`],
    };
  return { edge: 'neutral', title: 'Ready', parts: ['the next agent takes it'] };
}

const since = (now: number, at: number) => `${ago(now - at)} ago`;

/** What the queue holds on it, asked in words when the state line has no words of its own for it (needAction). */
function itemAsked(s: StandingInput): Standing | undefined {
  const need = s.item && needAction(s.item.kind);
  if (!s.item || !need) return undefined;
  const edge = s.item.edge === 'neutral' ? 'attention' : s.item.edge;
  const parts = s.item.title ? [s.item.title] : [];
  return { edge, title: `Waiting on you: ${need.ask}`, parts, primary: need.act ? 'need' : undefined };
}
