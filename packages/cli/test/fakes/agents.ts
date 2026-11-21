import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TrailAgent } from '../../src/mcp/agent';
import { createMcpServer } from '../../src/mcp/server';
import { callTool } from './callTool';

/** `onprogress` hears the tool's progress notifications (a waiting next_ticket says at once that it waits). */
export type CallOptions = { onprogress?: (p: { progress: number }) => void };
export type Call = <T = Record<string, unknown>>(
  name: string,
  args?: Record<string, unknown>,
  o?: CallOptions,
) => Promise<T>;

/**
 * One connected agent, the way the tests drive them: `local` is a `teamtrail mcp` process over stdio; with
 * `token`, it is a remote session of that token (the tools a remote HTTP session gets, as remoteAgentOpener makes
 * them). Several remote agents may share one token, as one token may hold several sessions.
 */
export function agents(root: () => string) {
  const open: { close(): void | Promise<void> }[] = [];
  async function connect(o: { name?: string; token?: string } = {}): Promise<Call> {
    const remote = o.token ? { tokenName: o.token, tokenId: `id-${o.token}` } : undefined;
    const agent = new TrailAgent({ root: root(), agent: o.name, pollMs: 20, remote, client: () => 'claude-code 1.0' });
    const server = createMcpServer(agent, '0.0.0-test');
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'claude-code', version: '1.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    open.push({ close: () => agent.close() }, client);
    return async <T>(name: string, args: Record<string, unknown> = {}, opts: CallOptions = {}) => {
      // A remote session can't skip discovery at all: it gets the refusal, not a question.
      const r = (await (remote
        ? client.callTool({ name, arguments: args }, undefined, opts)
        : callTool(client, root(), name, args, opts))) as {
        isError?: boolean;
        content: { text: string }[];
      };
      if (r.isError) throw new Error(r.content[0].text);
      return JSON.parse(r.content[0].text) as T;
    };
  }
  const closeAll = async () => {
    for (const o of open.splice(0)) await o.close();
  };
  return { connect, closeAll };
}
