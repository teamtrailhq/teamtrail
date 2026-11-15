import { z } from 'zod';
import type { TrailAgent } from '../agent';
import { text } from '../lineSafety';
import { type DefineTool, riskCategory, riskPaths, ticket, trail } from '../toolKit';
import { findPrecedentTool } from '../trail/precedents';

/** Decision memory: the calls already made in this repo, and in projects that share theirs. Read-only. */
export function registerMemoryTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'find_precedent',
    {
      human: 'none',
      title: 'Find a precedent',
      description:
        "Before you ask the human or make a call yourself: the decisions already made that may answer it, each with why it matches. strong: the same ticket or files and risk category, or a decision you named; act on it and cite it. suggested: only similar (wording, a shared assumption, or another project's decision with allProjects); read it, it never answers for you.",
      readOnly: true,
    },
    {
      text: text().min(1).describe('The question or the call, as you would ask it.'),
      trail,
      ticket: ticket.optional(),
      categories: z.array(riskCategory).max(8).optional(),
      paths: riskPaths.optional(),
      assumes: z.array(z.string()).max(20).optional(),
      relatesTo: z.array(z.string()).max(20).optional(),
      allProjects: z
        .boolean()
        .optional()
        .describe("Also look in the human's other projects that share their decisions."),
    },
    (a) => agent.with(findPrecedentTool, a),
  );
}
