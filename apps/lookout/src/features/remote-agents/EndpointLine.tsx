import { type McpEndpoint, BRAND } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';

/** Where agents connect right now, or how to start an endpoint when none is running. */
export function EndpointLine({ endpoints }: { endpoints: McpEndpoint[] }) {
  if (!endpoints.length)
    return (
      <MetaLine
        className="set-hint"
        parts={['No endpoint is running for this repo', { text: `npx ${BRAND.npm} mcp --http`, code: true }]}
      />
    );
  return (
    <ul className="ra-endpoints">
      {endpoints.map((e) => (
        <li key={e.url}>
          <MetaLine
            className="set-hint"
            parts={[
              { text: e.url, code: true },
              e.kind === 'lookout' ? 'the Lookout' : 'agent tools only',
              e.network ? 'open to your network' : 'this machine only',
            ]}
          />
        </li>
      ))}
    </ul>
  );
}
