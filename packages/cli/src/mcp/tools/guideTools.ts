import type { TrailAgent } from '../agent';
import type { DefineTool } from '../toolKit';
import { listGuidesView } from '../trail/guides';

/** Guide tools: read-only; installing and approving guides is the human's, in the Lookout or the CLI. */
export function registerGuideTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'list_guides',
    {
      human: 'none',
      title: 'List guides',
      description:
        "The installed guides: id, version, the ticket types each handles, checklist size and required checks. Tickets take their type's guides from the trail (the human's setting); a claim returns each guide's instructions and checklist.",
      readOnly: true,
    },
    {},
    async () => agent.with(listGuidesView, {}),
  );
}
