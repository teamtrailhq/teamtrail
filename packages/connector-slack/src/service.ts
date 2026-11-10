import { onEnvelope } from './service/interactions';
import { tick } from './service/notifications';
import { confirmOwner, resetOwner, startOwnerCode } from './service/owner';
import { markCreated, members, remove, updateSettings } from './service/settings';
import { adoptEnvTokens, verifyToken } from './service/setup';
import { statusOf } from './service/setupStatus';
import { SlackContext } from './service/slackContext';
import type { SlackServiceOptions } from './service/types';
import type { Envelope, EnvelopeResult } from './socket';
import type { SlackOwnerCode, SlackSettingsPatch, SlackStatus, SlackTokenResult, SlackUser } from './types';

export type { AskRecord } from './store';
export type { SlackServiceOptions } from './service/types';
export { OwnerError } from './service/owner';

/**
 * Slack for one tracker over Socket Mode: setup and settings, decisions saved from threads and
 * `/scout decide`, agent questions delivered as DMs, and batched trail notifications.
 */
export class SlackService {
  private ctx: SlackContext;
  private poll?: ReturnType<typeof setInterval>;

  constructor(o: SlackServiceOptions) {
    this.ctx = new SlackContext(o);
    const c = this.ctx.store.read();
    if (c.enabled) this.ctx.start();
    else if (!c.workspace) void adoptEnvTokens(this.ctx);
    if (o.pollMs) {
      this.poll = setInterval(() => void this.tick(), o.pollMs);
      this.poll.unref?.();
    }
  }

  /** Resolves once acks, follow-up work and the poll in flight are done. */
  async idle() {
    await this.ctx.socket?.idle();
    await this.ctx.ticking;
  }

  status(): SlackStatus {
    return statusOf(this.ctx);
  }

  markCreated() {
    return markCreated(this.ctx);
  }

  /** Step 3 or 4: routes a pasted token by prefix and verifies it live before saving. */
  pasteToken(raw: string): Promise<SlackTokenResult> {
    return verifyToken(this.ctx, raw.trim(), true);
  }

  updateSettings(patch: SlackSettingsPatch) {
    return updateSettings(this.ctx, patch);
  }

  /** A one-time code for the trail lead to enter in Slack. The code is in this answer only. */
  startOwnerCode(): SlackOwnerCode {
    return startOwnerCode(this.ctx);
  }

  /** The trail lead confirms the Slack account that was put forward (`id`, as the Lookout showed it). */
  confirmOwner(id: string): Promise<SlackStatus> {
    return confirmOwner(this.ctx, id);
  }

  resetOwner() {
    return resetOwner(this.ctx);
  }

  remove() {
    return remove(this.ctx);
  }

  /** Workspace members for the allowlist picker. */
  members(): Promise<SlackUser[]> {
    return members(this.ctx);
  }

  start() {
    this.ctx.start();
  }

  stop() {
    this.ctx.stop();
  }

  close() {
    clearInterval(this.poll);
    this.ctx.stop();
  }

  onEnvelope(e: Envelope): Promise<EnvelopeResult | void> {
    return onEnvelope(this.ctx, e);
  }

  /** Deliver new agent questions, close answered ones, and notify trail changes. */
  tick(): Promise<void> {
    return tick(this.ctx);
  }
}
