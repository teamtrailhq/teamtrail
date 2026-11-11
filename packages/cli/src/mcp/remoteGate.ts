import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { attention, OperationError, type Ticket } from '@teamtrail/core';
import type { z } from 'zod';

/*
 * What a remote agent may not do: act as the human. A local agent runs in the trail lead's own terminal, so the
 * tools trust it to pass on what they said there. An agent connected over HTTP may be a sandbox with nobody at
 * it, so over HTTP the human only ever speaks through the Lookout or Slack. Every such rule is declared here or
 * with the tool (`human` in its definition, which every tool must state), and applied here.
 */

/** An input that says the human made a call. `unless` lets through the values that claim nothing. */
export interface HumanInput {
  why: string;
  unless?: (value: unknown) => boolean;
}

/**
 * Whether a tool speaks for the human. Every tool states it; there is no default, so a new tool can't reach
 * remote agents as the human's voice by omission.
 * - `none`: it never does.
 * - `acts`: the whole tool is the human's voice (answering, approving). Remote sessions don't get it.
 * - `inputs`: these inputs claim the human decided something. Remote sessions can't pass them.
 */
export type HumanRole = 'none' | { kind: 'acts'; why: string } | { kind: 'inputs'; inputs: Record<string, HumanInput> };

const REMOTE = 'Not available over a remote connection';

/** The refusal a remote session gets for a tool that acts as the human. */
export const remoteToolRefusal = (tool: string, why: string) => `${tool}: ${REMOTE.toLowerCase()}. ${why}`;

const roles = new WeakMap<McpServer, Map<string, HumanRole>>();

/** What each tool declared, for the server it was defined on (remote or not). */
export function humanRoles(server: McpServer) {
  let map = roles.get(server);
  if (!map) roles.set(server, (map = new Map()));
  return map;
}

/** For a remote session: the inputs that claim the human's word say so in their description. */
export function markHumanInputs<S extends z.ZodRawShape>(shape: S, role: HumanRole): S {
  if (role === 'none' || role.kind !== 'inputs') return shape;
  const marked = { ...shape } as unknown as Record<string, z.ZodTypeAny>;
  for (const [key, input] of Object.entries(role.inputs)) {
    const schema = marked[key];
    if (schema) marked[key] = schema.describe(`${schema.description ?? ''} ${REMOTE}: ${input.why}`.trim());
  }
  return marked as unknown as S;
}

/** Refuses a remote call that passes an input claiming the human's word. */
export function assertNoHumanInputs(tool: string, role: HumanRole, args: Record<string, unknown>) {
  if (role === 'none' || role.kind !== 'inputs') return;
  for (const [key, input] of Object.entries(role.inputs)) {
    const value = args[key];
    if (value === undefined || input.unless?.(value)) continue;
    throw new OperationError(`${tool}: \`${key}\` is ${REMOTE.toLowerCase()}. ${input.why}`);
  }
}

type CallHandler = (request: unknown, extra: unknown) => Promise<unknown>;

/**
 * For a remote session, once every tool is defined: the tools that act as the human were never registered, so
 * they are not listed; a call to one anyway gets the reason instead of "not found". If the SDK's call handler
 * can't be wrapped, the tools still don't exist for the session: it fails closed.
 */
export function refuseHumanTools(server: McpServer) {
  const acting = [...humanRoles(server)].flatMap(([name, role]) =>
    role !== 'none' && role.kind === 'acts' ? [[name, role.why] as const] : [],
  );
  const handlers = (server.server as unknown as { _requestHandlers?: Map<string, CallHandler> })._requestHandlers;
  const original = handlers?.get('tools/call');
  if (!acting.length || !original) return;
  const reasons = new Map(acting);
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const why = reasons.get(request.params.name);
    if (why === undefined) return (await original(request, extra)) as never;
    return { isError: true, content: [{ type: 'text' as const, text: remoteToolRefusal(request.params.name, why) }] };
  });
}

/**
 * A HITL ticket (junction, prototype, a task marked for the human: whatever `attention` calls hitl) is the human's
 * to decide, for every agent, local or remote: one rule, so they can't drift. It closes only on the human's answer
 * to a question asked on it in this connection, given in the Lookout or Slack and not as an fyi (humanAnswer.ts
 * finds it). An answer given in an agent's chat only guides. The human's own Close and Resolve in the Lookout don't
 * come through here.
 */
export function assertHumanDecided(at: { ticket: Ticket; humanAnswered: boolean }) {
  if (attention(at.ticket) !== 'hitl' || at.humanAnswered) return;
  throw new OperationError(
    `${at.ticket.key} is the human's to decide: it closes only after they answer a question you asked on it, in the Lookout or Slack. Ask with ask_human while you hold the ticket (soon or blocking, not fyi) and wait for the answer, then close it (each answer backs one decision). An answer given in an agent's chat only guides.`,
  );
}
