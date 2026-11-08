import type { TrailAgent } from '../agent';
import type { DefineTool } from '../toolKit';
import { listGuidesView } from '../trail/guides';

/** Guide tools: read-only; installing and approving guides is the human's, in the Lookout or the CLI. */
export function registerGuideTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'list_guides',
    {
      title: 'List guides',
      description:
        'The guides you can give tickets (add_ticket, start_trail): id, version, the ticket types each handles, checklist size and required checks. A claim on a ticket with a guide returns its instructions and checklist.',
      readOnly: true,
    },
    {},
    async () => agent.with(listGuidesView, {}),
  );
}
