# Contributing

Run `npm run check` before opening a pull request. It runs lint, the Prettier format check, typecheck, build, the vitest and node:test suites, and `verify:mcp`. Changes that touch the Lookout UI should include a before/after screenshot.

## Code standards

ESLint (`eslint.config.js`) and Prettier (`.prettierrc.json`) enforce most of these.

- **One export per file.** Each file exports one component, hook, or class and is named after it (`SessionsList.tsx`, `useNow.ts`, `GitHubAdapter.ts`). Don't put a second component in the same file, even a private one. Give it its own file in the same folder.
- **Keep kinds apart.** Hooks go in `useX.ts`, pure helpers in `lib/` (apps) or a topic module (core), and shared types in `types.ts`. A component file never exports helpers or constants for other files.
- **200 lines max** per file, not counting blank lines and comments. Split by responsibility. Tests, `scripts/` and `tools/` are exempt.
- **Layout.**
  - Lookout: `components/ui/` holds design-system primitives, `features/<feature>/` holds one folder per zone or dialog, and app-wide code goes in `hooks/` and `lib/`.
  - core: modules are grouped by topic under `src/`, with the entry points listed in `package.json` `exports`.
  - Code used by more than one package belongs in `packages/core`, or in `packages/scout-avatar` for the avatar.
- **Imports.** Use inline type imports (`import { x, type Y } from '…'`) and one import statement per module. No unused imports and no import cycles.
- **Barrels.** A folder that is imported from outside gets one `index.ts` with explicit named re-exports. Inside the folder, import siblings by path, never through its own `index.ts`. Use `export *` only in package entry points.
- **Naming.** Components and classes use `PascalCase`, hooks `useCamelCase`, other modules `camelCase`, and folders `kebab-case`.
- **Tests.** vitest suites are `*.test.ts` and node:test suites are `*.node.test.ts`. Both live in the package's `test/` folder, with fakes in `test/fakes/` and recorded fixtures in `test/fixtures/`.
- **Formatting.** Run `npm run format` on the files you touch: single quotes, 120 columns, trailing commas.
- **Readable code** and **Presenting data**: see below.
- **Behavior-neutral refactors.** Keep package exports and public names stable. Run the full `check` and compare Lookout screenshots before and after.

## Readable code

Code is read far more often than it's written, by people and by agents. Write it so the next reader can follow it top to bottom without holding much in their head. ESLint enforces the first four rules in `src/`; reviewers check the rest.

- **No nested ternaries.** One `a ? b : c` is fine. For more cases, use early returns, a `switch`, or a lookup object. Don't build strings out of ternaries either: compute the parts into named variables first.
- **Flat control flow.** Return early for the edge cases and keep the main path unindented. Blocks nest three deep at most, callbacks three deep at most.
- **Few parameters.** A function takes four parameters at most. Past two or three, prefer one object with named fields, so call sites read like `saveCriteria({ root, map, ticket, items })`.
- **Small functions.** Keep each function to one job, under a complexity of 20. A long function with numbered steps wants to be those steps, each a named function.
- **Explicit variants.** Model cases as a union with a `kind` field and handle them with a `switch` that ends in an exhaustive `never` check, not with a scatter of optional fields and boolean flags.
- **Positive conditions.** Write `if (ready)` and `ready ? a : b` rather than negations; don't put `!` in a ternary's condition.
- **Name the steps.** Give intermediate values names instead of chaining everything into one expression. A name explains what a line is for; a comment explains only why it's unusual.
- **Components.** Keep handlers inline unless they're reused, render each case in its own small component instead of `cond && cond2 && …` chains, and fetch data in the component that shows it.

## Presenting data

Every screen presents data the same way, so people never have to work out where to look. Dense doesn't have to mean cluttered: give each piece of information one place and one voice.

- **Three levels, never more.** A **title** says what this is or what you need to do (at most two lines). One **context** line says where and who (ticket, agent, trail, kind). An optional **detail** line says why (reasons, files). Anything beyond that opens on click or shows in a tooltip.
- **Four type roles** (tokens and classes in `apps/lookout/src/styles/design-system.css`):
  - **title**: `--type-title` / `.t-title` (cards, heroes) and `--type-row-title` / `.t-row-title` (list rows);
  - **body**: `--type-body` / `.t-body`, running text;
  - **meta**: `--type-meta` / `.t-meta`, the quiet context and detail lines, sentence case;
  - **label**: `--type-label` / `.t-label` (alias `.mono-label`), small caps for section, field and group labels only.
- **Fonts have one job each.** Bricolage Grotesque is for the brand and zone heroes (`.t-pixel`, `.t-heading.caps`). Mono (`.t-code`) is for code, paths, ids and ticket keys inside any role. Everything else is the sans.
- **One accent, one meaning.** Red means "needs you now" (interrupting or blocking) and nothing else. Status is a thin left edge: `edge-urgent` (red), `edge-attention` (amber: work held up or at risk, such as blocked, flags, stalled claims, risky changes, reroutes, overlaps, integration), `edge-neutral` otherwise. Text stays neutral; a time turns red only on an urgent row.
- **Say it once.** Don't repeat what the screen already shows: no trail name for the trail on screen, no ticket key the title already contains, no reason that restates the urgency, the wait or the group.
- **Chips are for state only** (Done, Working, Blocking). Sentences and reasons are plain text joined with " · ".
- **Actions appear when you reach for them.** Secondary actions show on hover or keyboard focus, in place of the trailing time, and are always visible on touch screens. Primary actions (Approve, Add ticket) stay visible.
- **Build lists from the shared primitives** in `components/ui`: `Row` (edge, title, context, detail, trailing, actions, below) and `MetaLine` (parts joined with " · ", empty parts skipped, `code`, `strong` and `urgent` parts). Don't hand-style a new list row.

## Releasing

`main` is protected: changes land through a pull request once CI (`check`) passes. Maintainers publish the `teamtrail` CLI from Actions → **Release** → Run workflow, or with `gh`:

```bash
gh workflow run release.yml -f channel=next                      # prerelease: npx teamtrail@next
gh workflow run release.yml -f channel=latest                    # stable: the version in packages/cli/package.json
gh workflow run release.yml -f channel=latest -f version=0.8.0   # stable: a version you name
gh workflow run release.yml -f channel=stub                      # until launch: refresh the placeholder on latest
```

- **next** publishes `<upcoming>-next.<run>` under the `next` tag. `latest` doesn't move, so it's safe to run from any branch.
- **latest** must be higher than the current npm `latest`. It publishes, tags the commit `vX.Y.Z` and creates the GitHub release with generated notes.
- **stub**: until launch, `latest` is a placeholder from `.github/stub/` that only prints "not released yet". It publishes the next `0.0.x` so the npm page shows the current README and links, and refuses once a real release is on `latest`.
- Each run first does the full `npm run check` on the exact commit it publishes.
- The version in `packages/cli/package.json` is the product version and must match the newest release in the in-app changelog (see AGENTS.md, Version and release notes).
- Publishing uses npm trusted publishing: no npm token is stored, and every version carries provenance linking it to its commit and run.
