import type { TrailAgent } from '../agent';
import type { DefineTool } from '../toolKit';
import { projectsStatus } from '../trail/projects';

/** Other projects on this machine, read-only: agents can point the human at them but never act there. */
export function registerProjectTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'projects_status',
    {
      title: 'Other projects at a glance',
      description:
        "Read-only summaries of the human's other registered repos: agents running, questions waiting, what needs the human, blocked work. Use it to tell the human where else they are needed. You can't claim, close or change anything in another project.",
      readOnly: true,
    },
    {},
    () => projectsStatus({ root: agent.root, remote: agent.remote }),
  );
}
