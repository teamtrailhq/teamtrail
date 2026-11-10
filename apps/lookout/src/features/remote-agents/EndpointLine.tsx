import { type McpEndpoint } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { START_COMMAND } from './connectCommands';

/** What an endpoint is for. The Lookout's own port only ever answers this machine. */
function reach(e: McpEndpoint) {
  if (e.kind === 'lookout') return ['the Lookout', 'this machine only'];
  return [
    'for remote agents',
    e.network ? 'open to your network' : 'this machine only, until a tunnel or proxy shares it',
  ];
}

/** Where agents connect right now, and how to start the server for other machines when it isn't running. */
export function EndpointLine({ endpoints }: { endpoints: McpEndpoint[] }) {
  const shared = endpoints.some((e) => e.kind === 'standalone');
  return (
    <ul className="ra-endpoints">
      {endpoints.map((e) => (
        <li key={e.url}>
          <MetaLine className="set-hint" parts={[{ text: e.url, code: true }, ...reach(e)]} />
        </li>
      ))}
      {!shared && (
        <li>
          <MetaLine
            className="set-hint"
            parts={['For agents on other machines, start their server', { text: START_COMMAND, code: true }]}
          />
        </li>
      )}
    </ul>
  );
}
