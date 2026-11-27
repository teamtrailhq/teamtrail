import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** The demo's Lookout port: not the dev server's 7477, so both can run. */
export const DEMO_PORT = 7480;

export interface DemoPaths {
  root: string;
  marker: string;
  app: string;
  tracker: string;
  config: string;
  cli: string;
}

/** Where the demo lives: .demo/ at the repo root (git-ignored), the app repo and its own config folder in it. */
export function demoPaths(repoRoot: string): DemoPaths {
  const root = path.join(repoRoot, '.demo');
  const app = path.join(root, 'aisle');
  return {
    root,
    marker: path.join(root, '.made-by-demo'),
    app,
    tracker: path.join(app, '.teamtrail'),
    config: path.join(root, 'config'),
    cli: path.join(repoRoot, 'packages/cli/dist/cli.js'),
  };
}

/**
 * The demo's environment: its own config folder (sign-ins, approvals, the machine key), no GitHub CLI or tokens, and
 * no entry in your projects registry.
 */
export function demoEnv(paths: DemoPaths): Record<string, string> {
  return {
    TEAMTRAIL_CONFIG_DIR: paths.config,
    TEAMTRAIL_NO_GH_CLI: '1',
    TEAMTRAIL_NO_REGISTER: '1',
    GITHUB_TOKEN: '',
    GH_TOKEN: '',
  };
}

/** A real MCP client of the built CLI in the app repo, as Claude Code or Codex connect: `call` returns a tool's JSON. */
export async function mcpAgent(o: { paths: DemoPaths; client: string; version?: string }) {
  const env = { ...(process.env as Record<string, string>), ...demoEnv(o.paths) };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [o.paths.cli, 'mcp'],
    cwd: o.paths.app,
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: o.client, version: o.version ?? '2.1.0' });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args }, undefined, { timeout: 60 * 60_000 })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  return { call, close: () => client.close() };
}
