import { OperationError, type DecisionRecord, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { AgentContext } from './trail/agentContext';
import { claimTicket } from './trail/claimTicket';
import { closeTicket } from './trail/closeTicket';
import { verificationStatus } from './trail/completion';
import { setCriteria } from './trail/criteria';
import { getBrief, submitBrief } from './trail/discovery';
import { answerQuestion, ask, defaultWaitSeconds, inbox, waitForAnswer } from './trail/hitl';
import { flagKnowledge, proposeKnowledge, searchKnowledgeOp } from './trail/knowledge';
import { recordDecision, report, sessionView } from './trail/reporting';
import { submitReviewTool } from './trail/reviews';
import { startTrail } from './trail/startTrail';
import { addTicket, nextTicket, releaseTicket } from './trail/ticketOps';
import { resumeTrail, status, updateTrail } from './trail/trailOps';
import type { AgentOptions, CloseInput, WaitControl } from './trail/types';
import { ticketView } from './trail/views';

export { OperationError };
export { trailNameFamily } from './trail/trailName';
export { TRAIL_LEAD, type AgentOptions, type AskResult, type TicketPlanInput, type WaitControl } from './trail/types';

type Input<F extends (ctx: AgentContext, ...args: never[]) => unknown> = Parameters<F>[1];

/**
 * One connected agent (one MCP server process). Every tool maps onto the core
 * operations used by the Lookout, and every step is reported through an
 * in-process ActivityStream whose sessions are mirrored to the Lookout.
 */
export class TrailAgent {
  readonly adapter: AgentContext['adapter'];
  readonly activity: AgentContext['activity'];
  private ctx: AgentContext;

  constructor(opts: AgentOptions) {
    this.ctx = new AgentContext(opts);
    this.adapter = this.ctx.adapter;
    this.activity = this.ctx.activity;
  }

  get root() {
    return this.ctx.root;
  }

  /** Connected over HTTP with a token, possibly from another machine. */
  get remote() {
    return this.ctx.remote;
  }

  /** This agent's trail name, picked on first use so the client name is known. */
  agentId() {
    return this.ctx.agentId();
  }

  /** Who this agent's tracker writes are signed as on this machine (signed state). */
  get signedBy() {
    return this.ctx.signedBy;
  }

  lookout() {
    return this.ctx.lookout();
  }

  /** By id, key (`#3` or `3`) or title; default the current trail, else the most recently active one. */
  resolveTrail(ref?: string) {
    return this.ctx.resolveTrail(ref);
  }

  ticketView(snap: MapSnapshot, t: Ticket, records: DecisionRecord[] = []) {
    return ticketView(snap, t, records);
  }

  /** Runs a trail operation with this agent's context; newer tools call through here instead of a method each. */
  with<A, R>(fn: (ctx: AgentContext, input: A) => R, input: A): R {
    return fn(this.ctx, input);
  }

  status(trailRef?: string) {
    return status(this.ctx, trailRef);
  }

  /** `_meta` of an incoming tool call: tells the usage meter which agent log this process belongs to. */
  noteCall(meta: Record<string, unknown> | undefined) {
    this.ctx.sessions.noteCall(meta);
  }

  startTrail(input: Input<typeof startTrail>) {
    return startTrail(this.ctx, input);
  }

  resumeTrail(trailRef?: string) {
    return resumeTrail(this.ctx, trailRef);
  }

  updateTrail(input: Input<typeof updateTrail>) {
    return updateTrail(this.ctx, input);
  }

  nextTicket(input: Input<typeof nextTicket> = {}) {
    return nextTicket(this.ctx, input);
  }

  claimTicket(input: Input<typeof claimTicket> = {}) {
    return claimTicket(this.ctx, input);
  }

  releaseTicket(input: Input<typeof releaseTicket>) {
    return releaseTicket(this.ctx, input);
  }

  addTicket(input: Input<typeof addTicket>) {
    return addTicket(this.ctx, input);
  }

  closeTicket(input: CloseInput, ctl: WaitControl = {}) {
    return closeTicket(this.ctx, input, { seconds: defaultWaitSeconds(this.ctx), ctl });
  }

  /** Completion as a claim: close_ticket without the out-of-scope outcome. */
  reportCompletion(input: Omit<CloseInput, 'outcome'>, ctl: WaitControl = {}) {
    return closeTicket(this.ctx, { ...input, outcome: 'completed' }, { seconds: defaultWaitSeconds(this.ctx), ctl });
  }

  verificationStatus(input: Input<typeof verificationStatus>, ctl: WaitControl = {}) {
    return verificationStatus(this.ctx, input, defaultWaitSeconds(this.ctx), ctl);
  }

  submitReview(input: Input<typeof submitReviewTool>) {
    return submitReviewTool(this.ctx, input);
  }

  sessionView() {
    return sessionView(this.ctx);
  }

  report(input: Input<typeof report>) {
    return report(this.ctx, input);
  }

  submitBrief(input: Input<typeof submitBrief>) {
    return submitBrief(this.ctx, input);
  }

  setCriteria(input: Input<typeof setCriteria>) {
    return setCriteria(this.ctx, input);
  }

  getBrief(input: Input<typeof getBrief>) {
    return getBrief(this.ctx, input);
  }

  proposeKnowledge(input: Input<typeof proposeKnowledge>) {
    return proposeKnowledge(this.ctx, input);
  }

  searchKnowledge(input: Input<typeof searchKnowledgeOp>) {
    return searchKnowledgeOp(this.ctx, input);
  }

  flagKnowledge(input: Input<typeof flagKnowledge>) {
    return flagKnowledge(this.ctx, input);
  }

  recordDecision(input: Input<typeof recordDecision>) {
    return recordDecision(this.ctx, input);
  }

  /** `framing`: the question frames a trail that does not exist yet (`/scout new`), so it belongs to a chart session. */
  ask(input: Input<typeof ask>, ctl: WaitControl = {}) {
    return ask(this.ctx, input, ctl);
  }

  waitForAnswer(input: Input<typeof waitForAnswer>, ctl: WaitControl = {}) {
    return waitForAnswer(this.ctx, input, ctl);
  }

  /** Codex cancels MCP calls after 60 s unless `tool_timeout_sec` is raised, so its waits return before that. */
  defaultWaitSeconds() {
    return defaultWaitSeconds(this.ctx);
  }

  /** Open questions from every connected agent on this tracker, plus the ranked attention queue. */
  inbox(input: Input<typeof inbox> = {}) {
    return inbox(this.ctx, input);
  }

  /** Answer a question from the agent chat, as the trail lead. Works for any connected agent's question. */
  answerQuestion(input: Input<typeof answerQuestion>) {
    return answerQuestion(this.ctx, input);
  }

  /** Renew this agent's claim leases (every tool call is a heartbeat). */
  heartbeat() {
    this.ctx.heartbeat();
  }

  /** Keys of tickets whose lease ran out since the last call. */
  takeLostLeases() {
    return this.ctx.leases.takeLost();
  }

  /** Write pending session state now, so a tool result never runs ahead of the Lookout. */
  flush() {
    this.ctx.flush();
  }

  /** End the running session (agent disconnected) and write final state. */
  close(text = 'Agent disconnected') {
    this.ctx.close(text);
  }
}
