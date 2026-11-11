import { BRAND, DEFAULT_LEASE_MINUTES, LEASE_MINUTES_ENV } from '@teamtrail/core';

export const HELP = `${BRAND.name}: ${BRAND.category}

Usage: ${BRAND.slug} [options]
       ${BRAND.slug} mcp [--dir <path>] [--agent <trailName>] [--lease-minutes <n>] [--no-register]
       ${BRAND.slug} mcp --http [--port <n>] [--host <addr>] [--allow-host <name>] [--dir <path>] [--lease-minutes <n>] [--no-register]
       ${BRAND.slug} connect claude|codex [--dir <path>] [--no-register]
       ${BRAND.slug} connect claude|codex --url <http(s)://host:port/mcp> [--token-stdin | --token <token>] [--allow-http]
       ${BRAND.slug} projects add [path] | list | remove <id|path>
       ${BRAND.slug} connect slack [options]
       ${BRAND.slug} knowledge import <file.md> [--dir <path>]
       ${BRAND.slug} approve [--hash <hash>]… [--dir <path>]
       ${BRAND.slug} pair [--dir <path>]
       ${BRAND.slug} guides list|search|add|new|update|remove|lint … [--dir <path>]

Starts the Lookout for the current folder and opens it in your browser, signed in: it prints a one-time
link that pairs the browser that opens it. Every other browser needs a link of its own.

Commands:
  mcp            Serve the MCP server for coding agents over stdio
                 (registered for you by ${BRAND.slug} connect, pinned to this version)
                 A claimed ticket returns to the queue after --lease-minutes without a
                 tool call from its agent (default: ${DEFAULT_LEASE_MINUTES}, or $${LEASE_MINUTES_ENV})
  mcp --http     Serve the same MCP tools over streamable HTTP, for agents on other machines or in
                 sandboxes (default: 127.0.0.1:7421, path /mcp; nothing else is served on the port).
                 Every request needs a token created in the Lookout (Settings → Project → Remote agents);
                 with no token it answers 401. Plain HTTP: put it behind TLS or a tunnel before
                 opening it with --host. --allow-host <name> lets it answer to a tunnel's or
                 proxy's host name (IP addresses and localhost always work). --lease-minutes and
                 --no-register work as for mcp
  connect <agent>  Register the MCP server with Claude Code or Codex and add the /scout command.
                 It registers this exact version (npx -y ${BRAND.npm}@<version>), so agents never start a
                 newer one by surprise; run connect again from a newer version to update
                 (for Claude Code also a SessionStart hook, so usage comes from the transcript)
  connect <agent> --url <endpoint>
                 Point the agent at a ${BRAND.name} MCP server over HTTP instead of starting one.
                 The token comes from --token-stdin, $${BRAND.tokenEnv} or --token (which lands in
                 your shell history). Codex only stores the variable's name. The token is checked against
                 the endpoint, except over plain HTTP to another machine, where the check would send
                 it unencrypted: use https, or pass --allow-http to check anyway. --dir and
                 --no-register don't apply (the tracker folder is the server's) and are refused
  projects       The repos one Lookout supervises in All projects: add [path] registers a repo
                 (default: this one), list shows them, remove <id|path> forgets one. The list is
                 kept in your config dir, never in a repo. mcp and connect add their repo on start
                 unless --no-register or $${BRAND.noRegisterEnv} is set
  approve        What the repo asks this machine to trust and you haven't approved here (check
                 commands, policy, accepted briefs, confirmed criteria and knowledge, levels): shows
                 exactly what changed and asks y/N for each. Without a terminal it approves only
                 what --hash names exactly. The Lookout's Settings → Approvals does the same
  pair           A new one-time link that signs a browser in to the Lookout running for this folder
                 (works once, for 10 minutes). Phones and other computers pair from the Lookout:
                 Settings → You → Browsers & devices
  knowledge import <file.md>  Seed project knowledge from a markdown document: one suggestion per
                 ## heading, for you to review in the Lookout
  guides list     Guides agents take on (built in, local and from a catalog), with their status
  guides search [query] [--verified] [--registry <name>]
                 Search the guide catalogs: those listed in guides.json, then the official one
                 (unless guides.json says "official": false)
  guides add <id>|<catalog/id>|<file.md> [--registry <name>] [--sha256 <hash>] [--approve-checks]
                 Show the whole guide (paged when long) and, once you approve it, copy it into
                 the tracker folder and pin it in guides.lock.json. The lint refuses common
                 problems; it isn't a review. An id is looked up in every catalog, in order;
                 one found in more than one is refused until you name it as catalog/id.
                 Without a terminal nothing is added unless --sha256 names the file (an
                 agent that can run this CLI can pass the printed hash too, the same limit
                 as approve --hash). Each check command it proposes is asked about; without
                 a terminal, none is approved unless --approve-checks is given, and a
                 program Teamtrail doesn't know only ever at the terminal. Argv that itself
                 carries or downloads code is refused; what repo files run (npm scripts,
                 Makefiles, test files) is covered by your approval, not by the lint
  guides new <id> [--author <name>]
                 Write your own guide: a template in guides/<id>.md that passes the lint.
                 Agents can use it once the trail lead approves it in the Lookout
  guides update [id...] [--sha256 <hash>]
                 Newer versions of the catalog guides approved on this machine, from the
                 catalog each was approved from: shows what changed and asks before
                 installing (without a terminal, only the file --sha256 names; an agent
                 that can run this CLI can pass the printed hash too). New or
                 changed check commands are asked about on their own
  guides remove <id>     Remove an installed guide (its approved checks stay in verification.json)
  guides lint [dir|file...] [--json]
                 Schema and lint for common problems (default: the project's own guides); in a catalog
                 checkout also a test example per guide (examples/<id>/). Exits 1 on any error
  connect slack  Start the Lookout on the Slack setup (Socket Mode from this machine;
                 tokens stay in your local credential store)
  hook claude    The SessionStart hook itself (reads the hook payload on stdin)

Options:
  --dir <path>   Tracker folder (default: ./${BRAND.dataDir}, or $${BRAND.dataDirEnv})
  --port <n>     Port to listen on (default: 7420; the next free port is used if taken)
  --host <addr>  Interface to bind (default: 127.0.0.1). Other devices still need to be paired
  --no-open      Don't open the browser
  -v, --version  Print the version
  -h, --help     Show this help
`;

export function fail(msg: string): never {
  process.stderr.write(`${BRAND.slug}: ${msg}\nRun \`${BRAND.slug} --help\` for usage.\n`);
  process.exit(2);
}
