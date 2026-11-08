import { BRAND, DEFAULT_LEASE_MINUTES, LEASE_MINUTES_ENV } from '@teamtrail/core';

export const HELP = `${BRAND.name}: ${BRAND.category}

Usage: ${BRAND.slug} [options]
       ${BRAND.slug} mcp [--dir <path>] [--agent <trailName>] [--lease-minutes <n>]
       ${BRAND.slug} connect claude|codex [--dir <path>]
       ${BRAND.slug} connect slack [options]
       ${BRAND.slug} knowledge import <file.md> [--dir <path>]
       ${BRAND.slug} roles list|search|add|update|remove|lint … [--dir <path>]

Starts the Lookout for the current folder and opens it in your browser.

Commands:
  mcp            Serve the MCP server for coding agents over stdio
                 (claude mcp add ${BRAND.slug} -- npx -y ${BRAND.npm} mcp)
                 A claimed ticket returns to the queue after --lease-minutes without a
                 tool call from its agent (default: ${DEFAULT_LEASE_MINUTES}, or $${LEASE_MINUTES_ENV})
  connect <agent>  Register the MCP server with Claude Code or Codex and add the /scout command
                 (for Claude Code also a SessionStart hook, so usage comes from the transcript)
  knowledge import <file.md>  Seed project knowledge from a markdown document: one suggestion per
                 ## heading, for you to review in the Lookout
  roles list     Roles agents take on (built in, local and from a catalog), with their status
  roles search [query] [--verified] [--registry <name>]
                 Search the role catalogs listed in roles.json (the official one by default)
  roles add <id>|<file.md> [--registry <name>] [--approve-checks]
                 Copy a role into the tracker folder and pin it in roles.lock.json, after
                 the safety lint. Each check command it proposes is shown and asked about;
                 without a terminal, none is approved unless --approve-checks is given
  roles update [id...]  Install newer catalog versions; changed check commands are asked about again
  roles remove <id>     Remove an installed role (its approved checks stay in verification.json)
  roles lint <dir|file...> [--json]
                 Catalog tooling: schema, safety lint and a test example per role
                 (examples/<id>/); exits 1 on any error
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
