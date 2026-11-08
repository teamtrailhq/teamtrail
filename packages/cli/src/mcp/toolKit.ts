import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RISK_CATEGORIES, TICKET_TYPES, type TicketType } from '@teamtrail/core';
import { z } from 'zod';
import { OperationError, type TrailAgent, type WaitControl } from './agent';

export const ticketType = z.enum(TICKET_TYPES as [TicketType, ...TicketType[]]);
export const trail = z
  .string()
  .optional()
  .describe('Trail id, key (#3) or title. Default: the current trail, else the most recently active one.');
export const ticket = z.string().describe('Ticket key (#12) or id (12).');
export const riskCategory = z
  .enum(RISK_CATEGORIES)
  .describe("What the call touches, for the project's risk policy: high-risk categories are the human's to decide.");
export const guidesFilter = z
  .array(z.string())
  .max(20)
  .optional()
  .describe('Only take tickets whose guide is one of these (e.g. ["qa"]). Tickets without a guide are left out.');
export const guideId = z
  .string()
  .describe('The guide an agent takes on when it claims the ticket (list_guides). Must be an installed guide.');
export const checklistAnswers = z
  .array(
    z.object({
      item: z.string().describe('The item text, or its number'),
      done: z.boolean(),
      note: z.string().optional(),
    }),
  )
  .max(20)
  .optional()
  .describe("Answers to the ticket guide's checklist: one per item. Required when the guide has a checklist.");
export const riskPaths = z
  .array(z.string())
  .max(200)
  .describe('Repo-relative files the decision changes; checked against the risk policy path rules.');

type Extra = {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number };
  sendNotification: (n: {
    method: 'notifications/progress';
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
};

function result(v: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] };
}

/** Tells the agent, once, that a claim it held went back to the queue while it was silent. */
function withLostLeases(v: unknown, lost: string[]) {
  if (!lost.length || !v || typeof v !== 'object' || Array.isArray(v)) return v;
  return {
    ...v,
    leaseLost: {
      tickets: lost,
      note: 'Your claim went back to the queue (no tool calls for the lease length, or released in the Lookout). claim_ticket it again to continue, unless another agent took it.',
    },
  };
}

function failure(e: unknown) {
  const msg = e instanceof OperationError ? e.message : `${(e as Error).message ?? e}`;
  return { isError: true, content: [{ type: 'text' as const, text: msg }] };
}

export function waitControl(extra: Extra, message = 'Waiting on the human in the Lookout'): WaitControl {
  const token = extra._meta?.progressToken;
  return {
    signal: extra.signal,
    onProgress:
      token === undefined
        ? undefined
        : (s) =>
            void extra
              .sendNotification({
                method: 'notifications/progress',
                params: { progressToken: token, progress: s, message },
              })
              .catch(() => {}),
  };
}

/** Registers one tool: its result is JSON text, errors become tool errors, and agent state is flushed after every call. */
export function toolDefiner(server: McpServer, agent: TrailAgent) {
  return <S extends z.ZodRawShape>(
    name: string,
    meta: { title: string; description: string; readOnly?: boolean },
    shape: S,
    fn: (args: z.infer<z.ZodObject<S>>, extra: Extra) => Promise<unknown>,
  ) =>
    server.registerTool(
      name,
      {
        title: meta.title,
        description: meta.description,
        inputSchema: shape,
        annotations: { readOnlyHint: !!meta.readOnly, openWorldHint: false },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args: any, extra: any) => {
        try {
          agent.noteCall(extra?._meta);
          agent.heartbeat();
          return result(withLostLeases(await fn(args, extra), agent.takeLostLeases()));
        } catch (e) {
          return failure(e);
        } finally {
          agent.flush();
        }
      }) as never,
    );
}

export type DefineTool = ReturnType<typeof toolDefiner>;
