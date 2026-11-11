/**
 * Single source for the in-app Changelog tab, newest first. The newest release's version is the product version: it
 * must equal packages/cli/package.json (a test checks). A feature PR adds a release with a minor bump and 1–4 short,
 * user-facing lines; a fix PR bumps the patch. `NEXT` only teases what's coming.
 */
import { OLDER_RELEASES } from './olderReleases';

export interface Release {
  version: string;
  date: string;
  items: string[];
}

export const NEXT: { area: string; items: string[] }[] = [
  { area: 'Teamtrail Cloud', items: ['Agents that run in the cloud, steered from the same Lookout'] },
];

export const RELEASES: Release[] = [
  {
    version: '0.27.0',
    date: '2026-11-11',
    items: [
      'Teamtrail opens your browser ready to sign in with one click; `teamtrail pair` does the same for another tab',
    ],
  },
  {
    version: '0.26.2',
    date: '2026-11-11',
    items: ['The Lookout shows the new teamtrail. wordmark'],
  },
  {
    version: '0.26.1',
    date: '2026-11-11',
    items: [
      'A refreshed logo: the trail’s destination is larger, and there are light and dark versions that follow your theme',
    ],
  },
  {
    version: '0.26.0',
    date: '2026-11-11',
    items: [
      'The Lookout asks you to sign in: open the link `teamtrail` prints, and pair your phone with a QR code (again after each restart)',
      'Your answers count only when you give them in the Lookout or Slack, and skipping discovery or changing a trail’s mode or destination waits for your Approve',
      'Check commands, briefs, criteria and other trusted settings run only once you approve them on this machine, in Settings → Approvals',
      'Changes made to trail files outside Teamtrail have no effect until you accept them',
    ],
  },
  {
    version: '0.25.0',
    date: '2026-11-10',
    items: [
      'Agents on other machines or in cloud sandboxes can join your trails: `teamtrail mcp --http` serves the same tools over HTTP',
      'One token per remote agent, created and revoked in Settings → Remote agents; without a token nothing is reachable',
      '`teamtrail connect claude|codex --url` points an agent at a remote Teamtrail',
    ],
  },
  {
    version: '0.24.2',
    date: '2026-11-10',
    items: ['A ticket’s description no longer repeats which trail it is part of'],
  },
  {
    version: '0.24.1',
    date: '2026-11-10',
    items: ['Buttons in the same row are always the same size'],
  },
  {
    version: '0.24.0',
    date: '2026-11-10',
    items: [
      'Focus in the header: see at a glance whether it is on, and start or end it in one click',
      'Sign in with GitHub, and pick your repo or Linear team from a searchable list',
      'Write your own guides with `teamtrail guides new`, approve them in Settings and share them with the catalog',
      'Settings is its own page, and the trail map has a cleaner, flatter look',
      'Smaller polish: one colour for work in progress everywhere, a calmer first run and clearer Slack setup',
    ],
  },
  {
    version: '0.23.0',
    date: '2026-11-08',
    items: [
      'Match work to models: switch it on for a trail in Settings and each agent gets the tickets that fit the model it runs on, research on fast models and junctions on the strongest. You set the tier per ticket type; Teamtrail never switches a model, and a ticket no connected agent is strong enough for waits in your queue',
      'Guides: a ticket can ask for a reviewer, QA, security, docs or architect, and the agent that claims it gets that guide’s instructions and a checklist it must answer before the work counts as done. Pick a trail’s team and each ticket’s guide in the Lookout, and add more guides from a moderated catalog in Settings → Guides. A guide can add checks but never remove one, its commands only run after you approve them, and a guide file edited after you approved it is switched off until you look at it again',
      "Records has a new Trail stats view: delivery across every trail, by vendor, agent and ticket type, with plain observations from your own numbers. Teamtrail doesn't route work from them",
      'MILOOPS is now Teamtrail. Missions are trails, the command center is the Lookout, MILO is Scout, and `/milo` is `/scout`',
      'More room for the map: the summary of counts now slides up from a tab when you want it',
      'A new day and night look, starting in night, with an Appearance setting to switch to day or follow your system',
      'The map is now a landscape: tickets are trail signs, the trail shows what is walked and what is ahead, and an X marks the destination',
      'A new greeting when you start `teamtrail` in a terminal',
      'A new logo, a t whose stem runs along a trail to a node, and a new look for Scout: the original CRT head with ear cups and a baseball cap, with a lamp on the cap at night. No more pixel art, and new fonts too',
      "All projects: every repo you supervise in one view, with one list of what needs you across them and what changed while you were away. Answer an agent's question in any repo from there, and switch projects from the header. Agents add their repo when they connect (`--no-register` opts out), or add one with `teamtrail projects add`",
    ],
  },
  {
    version: '0.22.0',
    date: '2026-11-05',
    items: [
      'A calmer, clearer command center: every list now reads the same way, what it is first, then one quiet line of context, and details when you want them',
      'Red now only means something needs you now; other states show as a thin edge instead of colored text everywhere',
      'The open question in a conversation can no longer be hidden by its suggested answers, and the phone header no longer runs off the side',
    ],
  },
  {
    version: '0.21.0',
    date: '2026-11-05',
    items: [
      'New plans can now edit a ticket, remove a dependency and reopen finished work, instead of working around it',
      "Slack digests follow the team's digest setting (digestMinutes in attention.json); 0 turns them off, and everything still waits in Waiting on you",
      "Remove a finished task's workspace from Settings → Workspaces or the ticket; the branch stays, and MILOOPS asks before discarding uncommitted changes",
    ],
  },
  {
    version: '0.20.0',
    date: '2026-11-04',
    items: [
      'Separate workspaces: switch on Settings → Workspaces and each ticket an agent claims gets its own copy of the repo on its own branch, so agents working at the same time don’t step on each other. When the work is done you get the branch to review; MILOOPS never merges or pushes for you',
      'Warnings before a clash: agents say which files they expect to change. When two of them plan to change the same files, the second one is warned, and you see it in Waiting on you; open it to release either claim',
      'When two agents’ branches did change the same files, Waiting on you suggests a ticket to bring the work together. One click adds it, waiting on both tickets, with the files listed',
      'The ticket inspector shows which files an agent expects to change and the branch it works on',
      'Fix: an execute ticket marked as needing you keeps that mark when saved to local files, GitHub Issues or Linear',
    ],
  },
  {
    version: '0.19.0',
    date: '2026-11-04',
    items: [
      'Risk policy: you decide what always needs you, such as database changes, logins and permissions, billing, deleting data or new dependencies (Settings → Risk policy). Agents can no longer make those calls on their own; they ask you. Their other decisions are labelled by risk in the briefing, and work that touched risky files without asking comes to you to check',
      'One ranked list of everything that needs you in Waiting on you: questions, approvals, blocked work, briefs, knowledge and new plans, most important first, each with the reason (for example “blocks 3 tickets” or “claude-02 is waiting”). Related items are grouped so you answer them together; snooze what can wait',
      'Fewer interruptions: agents say how urgent a question is, and only urgent items notify you (browser or Slack). Focus for an hour from the header, set quiet hours in Settings → Attention, and the rest waits in the list and the digest',
      'Plans that adapt: missions list the assumptions they rely on, starting with the ones in the discovery brief. When an agent finds one is wrong, it shows the evidence and proposes a new plan; the tickets it would change are paused, the map previews the change, and nothing happens until you approve',
      'Challenge the destination: an agent can tell you the work already exists, the mission targets the wrong problem, or it should be rescoped, with evidence and a suggested new goal',
      'Assumptions on the Plan tab (confirm the ones you know are true) and an assumptions field when you create a mission',
      'Fix: when an agent asks two questions at once, your answer goes to the one you opened; the inbox stats line no longer gets covered by the list',
    ],
  },
  {
    version: '0.18.0',
    date: '2026-11-04',
    items: [
      'Acceptance criteria: agents write down what done means before they start (required on missions with a discovery brief). When they finish, each point needs proof: one of your checks, a named test, the pull request, or your sign-off',
      'Work whose criteria lack proof goes back with the reason; points only you can confirm come to your inbox to sign off',
      'Business rules from your project knowledge are suggested as criteria, and the ticket shows any rule no criterion covers yet. Confirm a ticket’s criteria in the inspector',
      'Cross-vendor review: when Claude and Codex agents both run, each reviews the other’s work first',
      'Fix: answers from the command center could hang when too many live updates were open; all updates now share one connection',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-11-03',
    items: [
      'Discovery brief: new missions start with an agent mapping the existing system (files, conventions, data and API impact, risks, assumptions, product context). Implementation tickets wait until you accept the brief or ask for changes, from the banner over the map or the card in Communication',
      'Create mission: start a mission from the New mission dialog without a terminal; any agent picks it up with /milo resume',
      'Knowledge: what agents need to know about your codebase and product (architecture, conventions, gotchas, dead ends, business rules, personas, UX principles, pricing). Agents propose, you confirm, keep as an assumption or retire. Confirmed entries reach agents with every claim, picked for the ticket with the reason, and the inspector shows what an agent gets',
      'Knowledge about specific files is flagged for re-confirmation when those files change',
      'Save decisions, cancelled tickets (as dead ends) and brief sections as knowledge in one click; seed it from a document with miloops knowledge import <file.md>',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-11-03',
    items: [
      'Mission report (Mission plan → Report): tickets done, mission and median ticket lead time, your interventions, rework, review results and cost per verified ticket. Hover any number to see how it is computed; export it as markdown',
      'Agents report the same numbers in one line from the status tool',
      'Agents use missions for big work only, and decide routine calls themselves, keeping each one as a decision record you can review or reverse; they ask you when the call changes product behaviour, data, security, billing, a public API or the schema',
      'Decisions: filter by who made the call, agents on their own or people. The briefing now counts only the calls agents made themselves, not your answers they recorded',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-10-31',
    items: [
      'Verification in the ticket inspector: the level that applies and where it comes from, every attempt newest first with the git evidence (base → head, files changed, flags), its checks, exit codes, durations and the failing output, and the full log on demand',
      'Verifying, Rework and Blocked on the map, in the legend and as status counters on missions that verify completions',
      'Operator calls on a verifying or blocked ticket: Approve, Re-run checks, Send to rework with a note, Accept anyway and Unblock. Overrides need a reason, and each call is kept as a verdict next to the attempts and in the mission history. Approve asks for a re-run when the code changed since the checks passed',
      'Set the verification level of a mission (Settings → Verification) or of one ticket (inspector). Only you can change it; agents cannot',
      'The inspector updates live while checks run',
      'Independent review: at Checks + review, a passing completion gets a review ticket that another agent takes and answers with PASS, FAIL (with findings) or NEEDS_HUMAN. The agent that did the work is never given its own review',
      'Waiting on you lists reviewed work to approve (Checks + review + you) and held tickets, and Slack posts them with Approve and Rework… buttons',
      'Agents can name their pull request in `report_completion` (`pr`); PR and CI tracking then follows that PR first',
    ],
  },
  ...OLDER_RELEASES,
];
