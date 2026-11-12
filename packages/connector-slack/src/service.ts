import type { Envelope, EnvelopeResult } from './link/types';
import { disconnect, finishConnect, startConnect } from './service/connect';
import { cancelConnect, previewConnect } from './service/connectPreview';
import { onEnvelope } from './service/interactions';
import { tick } from './service/notifications';
import { members, updateSettings } from './service/settings';
import { statusOf } from './service/setupStatus';
import { SlackContext } from './service/slackContext';
import type { SlackServiceOptions } from './service/types';
import type { SlackConnectPreview, SlackConnectStart, SlackSettingsPatch, SlackStatus, SlackUser } from './types';

export type { AskRecord } from './store';
export type { SlackServiceOptions } from './service/types';
export { ConnectError } from './service/connect';

/**
 * Slack for one tracker, through Teamtrail's Scout service: connecting with Add Scout to Slack, settings,
 * decisions saved from threads and `/scout decide`, agent questions delivered as DMs, and batched trail
 * notifications.
 */
export class SlackService {
  private ctx: SlackContext;
  private poll?: ReturnType<typeof setInterval>;

  constructor(o: SlackServiceOptions) {
    this.ctx = new SlackContext(o);
    if (this.ctx.store.read().enabled) this.ctx.start();
    if (o.pollMs) {
      this.poll = setInterval(() => void this.tick(), o.pollMs);
      this.poll.unref?.();
    }
  }

  /** Resolves once acks, follow-up work and the poll in flight are done. */
  async idle() {
    await this.ctx.link?.idle();
    await this.ctx.ticking;
  }

  status(): SlackStatus {
    return statusOf(this.ctx);
  }

  /**
   * Add Scout to Slack: where to send the browser. The PKCE verifier stays in this process. `port` is the one the
   * Lookout's request came in on and `project` the page's, so the browser comes back to the same Lookout and project.
   */
  startConnect(o: { port?: number; project?: string } = {}): SlackConnectStart {
    return startConnect(this.ctx, o);
  }

  /** The browser came back: who the code belongs to, for the trail lead to confirm before anything is saved. */
  previewConnect(code: string): Promise<SlackConnectPreview> {
    return previewConnect(this.ctx, code);
  }

  cancelConnect() {
    cancelConnect(this.ctx);
  }

  /** The trail lead chose Connect: trade the service's code for this Teamtrail's link. */
  finishConnect(code: string): Promise<SlackStatus> {
    return finishConnect(this.ctx, code);
  }

  /** Revoke the link at the service and forget everything Slack kept on this machine. */
  disconnect(): Promise<SlackStatus> {
    return disconnect(this.ctx);
  }

  updateSettings(patch: SlackSettingsPatch) {
    return updateSettings(this.ctx, patch);
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
