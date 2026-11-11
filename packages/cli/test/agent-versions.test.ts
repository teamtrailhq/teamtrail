import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ActivityStream, setRunningVersion } from '@teamtrail/core';
import { AgentDocWriter } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentVersionWarnings } from '../src/serve/agentVersionWarnings';

/*
 * `connect` pins an agent to the version that ran it: after an update, the Lookout and its agents can differ. The
 * Lookout says so on start, naming the agent and what to run.
 */
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-versions-'));
});
afterEach(() => {
  setRunningVersion(undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

function agentOn(version: string | undefined, id: string, agent: string) {
  setRunningVersion(version);
  const activity = new ActivityStream();
  const writer = new AgentDocWriter(root, activity, { pollMs: 10_000 });
  activity.startSession({ id, agent, mode: 'work', mapId: 'm1' });
  writer.flush();
  writer.close();
}

describe('the Lookout on start', () => {
  it('warns about connected agents pinned to another version, and only those', async () => {
    agentOn('0.24.0', 's_1', 'claude-01');
    agentOn(undefined, 's_2', 'codex-01');
    agentOn('0.25.0', 's_3', 'claude-02');
    const said = (await agentVersionWarnings(root, '0.25.0')).join('\n');
    expect(said).toMatch(/claude-01 runs Teamtrail 0\.24\.0, the Lookout 0\.25\.0: run `teamtrail connect` again/);
    expect(said).toMatch(/codex-01 runs an older Teamtrail than this Lookout \(0\.25\.0\)/);
    expect(said).not.toMatch(/claude-02/);
  });
});
