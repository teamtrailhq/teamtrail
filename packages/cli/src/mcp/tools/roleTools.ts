import type { TrailAgent } from '../agent';
import type { DefineTool } from '../toolKit';
import { listRolesView } from '../trail/roles';

/** Role tools: read-only; installing and approving roles is the human's, in the Lookout or the CLI. */
export function registerRoleTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'list_roles',
    {
      title: 'List roles',
      description:
        'The roles you can give tickets (add_ticket, start_trail): id, version, the ticket types each handles, checklist size and required checks. A claim on a ticket with a role returns its instructions and checklist.',
      readOnly: true,
    },
    {},
    async () => agent.with(listRolesView, {}),
  );
}
