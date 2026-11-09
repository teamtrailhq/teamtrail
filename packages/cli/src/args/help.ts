import { BRAND, DEFAULT_LEASE_MINUTES, LEASE_MINUTES_ENV } from '@teamtrail/core';

export const HELP = `${BRAND.name}: ${BRAND.category}

Usage: ${BRAND.slug} [options]
       ${BRAND.slug} mcp [--dir <path>] [--agent <trailName>] [--lease-minutes <n>] [--no-register]
       ${BRAND.slug} connect claude|codex [--dir <path>] [--no-register]
       ${BRAND.slug} projects add [path] | list | remove <id|path>
       ${BRAND.slug} connect slack [options]
       ${BRAND.slug} knowledge import <file.md> [--dir <path>]
       ${BRAND.slug} guides list|search|add|new|update|remove|lint … [--dir <path>]

Starts the Lookout for the current folder and opens it in your browser.

Commands:
  mcp            Serve the MCP server for coding agents over stdio
                 (claude mcp add ${BRAND.slug} -- npx -y ${BRAND.npm} mcp)
                 A claimed ticket returns to the queue after --lease-minutes without a
                 tool call from its agent (default: ${DEFAULT_LEASE_MINUTES}, or $${LEASE_MINUTES_ENV})
  connect <agent>  Register the MCP server with Claude Code or Codex and add the /scout command
                 (for Claude Code also a SessionStart hook, so usage comes from the transcript)
  projects       The repos one Lookout supervises in All projects: add [path] registers a repo
                 (default: this one), list shows them, remove <id|path> forgets one. The list is
                 kept in your config dir, never in a repo. mcp and connect add their repo on start
                 unless --no-register or $${BRAND.noRegisterEnv} is set
  knowledge import <file.md>  Seed project knowledge from a markdown document: one suggestion per
                 ## heading, for you to review in the Lookout
  guides list     Guides agents take on (built in, local and from a catalog), with their status
  guides search [query] [--verified] [--registry <name>]
                 Search the guide catalogs: those listed in guides.json, then the official one
                 (unless guides.json says "official": false)
  guides add <id>|<catalog/id>|<file.md> [--registry <name>] [--approve-checks]
                 Copy a guide into the tracker folder and pin it in guides.lock.json, after
                 the safety lint. An id is looked up in every catalog, in order; one found in
                 more than one is refused until you name it as catalog/id. Each check command
                 it proposes is shown and asked about; without a terminal, none is approved
                 unless --approve-checks is given
  guides new <id> [--author <name>]
                 Write your own guide: a template in guides/<id>.md that passes the lint.
                 Agents can use it once the trail lead approves it in the Lookout
  guides update [id...]  Install newer catalog versions; changed check commands are asked about again
  guides remove <id>     Remove an installed guide (its approved checks stay in verification.json)
  guides lint [dir|file...] [--json]
                 Schema and safety lint (default: the project's own guides); in a catalog
                 checkout also a test example per guide (examples/<id>/). Exits 1 on any error
  connect slack  Start the Lookout on the Slack setup (Socket Mode from this machine;
                 tokens stay in your local credential store)
  hook claude    The SessionStart hook itself (reads the hook payload on stdin)

Options:
  --dir <path>   Tracker folder (default: ./${BRAND.dataDir}, or $${BRAND.dataDirEnv})
  --port <n>     Port to listen on (default: 7420; the next free port is used if taken)
  --host <addr>  Interface to bind (default: 127.0.0.1)
  --no-open      Don't open the browser
  -v, --version  Print the version
  -h, --help     Show this help
`;

export function fail(msg: string): never {
  process.stderr.write(`${BRAND.slug}: ${msg}\nRun \`${BRAND.slug} --help\` for usage.\n`);
  process.exit(2);
}
