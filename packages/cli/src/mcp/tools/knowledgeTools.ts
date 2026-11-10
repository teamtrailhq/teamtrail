import { KNOWLEDGE_KINDS } from '@teamtrail/core';
import { z } from 'zod';
import type { TrailAgent } from '../agent';
import { text } from '../lineSafety';
import { type DefineTool, trail } from '../toolKit';

const kind = z.enum(KNOWLEDGE_KINDS as [string, ...string[]]);

/** Project knowledge: propose, search, flag. Relevant confirmed entries also arrive with every claim. */
export function registerKnowledgeTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'propose_knowledge',
    {
      human: 'none',
      title: 'Propose project knowledge',
      description:
        'Something the next agent should know about this codebase or product: an architecture fact, a convention, a gotcha, a dead end (an approach that failed and why), a business rule, a product decision, a persona, a UX principle, pricing. It is a suggestion until the human confirms it.',
    },
    {
      trail,
      kind,
      title: z.string().min(1).describe('One line.'),
      body: text().min(1).describe('The knowledge, short and specific, with paths.'),
      scope: z.array(z.string()).optional().describe('Path globs it applies to, e.g. "src/notify/**".'),
      tags: z.array(z.string()).optional(),
      files: z
        .array(z.string())
        .optional()
        .describe('Files the entry is about; it is flagged for review when they change.'),
    },
    (a) => agent.proposeKnowledge(a),
  );

  tool(
    'search_knowledge',
    {
      human: 'none',
      title: 'Search project knowledge',
      description:
        'Find knowledge by words, paths or tags. Each hit has its status: confirmed, assumption or suggested.',
      readOnly: true,
    },
    {
      query: z.string().optional(),
      paths: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      kind: kind.optional(),
      includeOutdated: z.boolean().optional(),
    },
    (a) => agent.searchKnowledge(a),
  );

  tool(
    'flag_knowledge',
    {
      human: 'none',
      title: 'Flag knowledge as possibly outdated',
      description:
        'When an entry contradicts the code or the product, flag it with the evidence instead of ignoring it.',
    },
    { id: z.string().describe('K-<n>'), reason: text().min(1).describe('What is wrong, with evidence.') },
    (a) => agent.flagKnowledge(a),
  );
}
