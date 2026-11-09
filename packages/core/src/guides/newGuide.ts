import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { OperationError } from '../planning/operations/operationError';
import { BUILTIN_GUIDES } from './builtin/builtinGuides';
import { lintGuide } from './guideLint';
import { guideFilePath, guidesDir } from './guideStore';

const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** `api-design` → `Api design`. */
const nameOf = (id: string) => {
  const words = id.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A guide file that passes the lint, with every field filled in and plain placeholders to replace. */
export function guideTemplate(input: { id: string; author: string }) {
  // a YAML-safe name: letters, digits and plain punctuation
  const author = input.author.replace(/[^\p{L}\p{N} .,'&()-]/gu, '').trim() || 'Your team';
  return `---
v: 1
id: ${input.id}
name: ${nameOf(input.id)}
version: 1.0.0
summary: One sentence on what this guide makes the agent do.
handles:
  types: [task, execute]
checklist:
  - Replace this with something a person could check when the work is done
  - Keep each item short; the agent answers every one when it completes
author: ${author}
license: MIT
---

Write what the agent should do on a ticket that asks for this guide, in plain steps.

1. What to look at before changing anything.
2. What to do while working, and what to avoid.
3. What to leave behind for the trail lead: notes, tests, numbers.
`;
}

/**
 * Writes a new hand-written guide, `guides/<id>.md`, from the template. It isn't pinned: agents can't use it until the
 * trail lead approves it (Settings → Guides). Refuses an id that isn't kebab-case, a built-in guide's id (a file with
 * that id would replace it) and an existing file.
 */
export function newGuide(input: { root: string; id: string; author: string }) {
  if (!ID_RE.test(input.id) || input.id.length > 40)
    throw new OperationError(`"${input.id}" isn't a guide id: use kebab-case (a-z, 0-9 and dashes), like api-design`);
  if (input.id in BUILTIN_GUIDES)
    throw new OperationError(
      `${input.id} is a built-in guide; pick another id (a file named ${input.id}.md replaces it)`,
    );
  const file = guideFilePath(input.root, input.id);
  if (existsSync(file)) throw new OperationError(`${file} already exists`);
  const text = guideTemplate(input);
  mkdirSync(guidesDir(input.root), { recursive: true });
  writeFileSync(file, text);
  return { file, lint: lintGuide(text) };
}
