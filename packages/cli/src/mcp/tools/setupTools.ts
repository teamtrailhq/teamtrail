import { z } from 'zod';
import type { TrailAgent } from '../agent';
import { type DefineTool, trail, ticket } from '../toolKit';

const check = z.object({
  name: z.string().min(1).max(40).describe('Lowercase letters, digits and dashes: test, lint, web-build.'),
  run: z
    .array(z.string().min(1).max(500))
    .min(1)
    .max(32)
    .describe('The command as argv, never a shell string: ["npm", "test"].'),
  cwd: z
    .string()
    .min(1)
    .max(300)
    .optional()
    .describe('The folder it runs in, relative to the repo; the top if left out.'),
});

/** Setup tools: the setup ticket of a new repo proposes the checks its trail is verified with. */
export function registerSetupTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'propose_checks',
    {
      human: 'none',
      title: 'Propose the checks',
      description:
        'Only for a new repo\'s setup ticket (add_ticket setup: true) you claimed, while no checks are approved: propose the checks the trail is verified with, each a name and its argv (e.g. test: ["npm", "test"]), once the project you set up builds and its tests run. It writes them to verification.json as a proposal and approves nothing: the trail lead approves them in the Lookout. Then call close_ticket: it waits for the approval and runs them on your work. Works for remote agents too. `unavailable` lists programs the machine running the checks doesn\'t have.',
    },
    { trail, ticket: ticket.optional(), checks: z.array(check).min(1).max(10) },
    (a) => agent.proposeChecks(a),
  );
}
