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
 * A HITL ticket (junction, prototype, a task marked for the human) is the human's to decide. Locally the agent
 * is trusted to have asked; a remote session must show the answer: one given in the Lookout or Slack to a
 * question it asked in this session.
 */
export function assertHumanDecided(at: { remote: boolean; ticket: Ticket; humanAnswered: boolean }) {
  if (!at.remote || attention(at.ticket) !== 'hitl' || at.humanAnswered) return;
  throw new OperationError(
    `${at.ticket.key} is the human's to decide, and over a remote connection their answer has to come through the Lookout or Slack. Ask with ask_human, then close it in this session once they've answered.`,
  );
}
