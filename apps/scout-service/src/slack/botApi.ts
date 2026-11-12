import { SlackApi } from '@teamtrail/connector-slack/api';
import type { ServiceContext } from '../serviceContext';

type BotContext = Pick<ServiceContext, 'store' | 'cipher' | 'config' | 'fetch'>;

/** A Slack client with this workspace's bot token, or undefined when Scout isn't installed there. */
export async function botApi(ctx: BotContext, teamId: string) {
  const workspace = await ctx.store.workspace(teamId);
  if (!workspace) return undefined;
  const token = ctx.cipher.open(workspace.botToken, workspace.teamId);
  return new SlackApi({ token, apiUrl: ctx.config.slackApiUrl, fetch: ctx.fetch });
}
