import type { Release } from './releases';

/** Releases 0.26–0.37, kept apart so `releases.ts` stays short. Newest first. */
export const MID_RELEASES: Release[] = [
  {
    version: '0.37.0',
    date: '2026-11-15',
    items: [
      'Trail stats has a Scorecard: how each model, agent and vendor does on your own tickets, verified first time, rework and cost per verified ticket, with small samples marked too few',
      'Settings → Model matching suggests a tier per ticket type when one model clearly does better on your repo, with the numbers; nothing changes until you take it',
      'Copy the scorecard as Markdown to share it with your team',
    ],
  },
  {
    version: '0.36.0',
    date: '2026-11-15',
    items: [
      "Proof reports are signed with your machine's key: commit the key file Teamtrail writes in .teamtrail/proof-keys, and anyone can check a report with `teamtrail proof verify`",
      "A GitHub Action, Verified by Teamtrail, checks every proof on a pull request and can be made a required check, so a PR without a valid proof can't merge",
      'The ticket inspector shows the proof, with Copy for PR and a link to the comment once it is posted',
    ],
  },
  {
    version: '0.35.0',
    date: '2026-11-15',
    items: [
      "Settings → Project → Proof on pull requests: switch it on and Teamtrail posts each done ticket's report on its open pull request, updating the same comment as things change",
      'A Teamtrail proof check sits next to CI on the pull request and passes only when the ticket is verified at its latest commit',
    ],
  },
  {
    version: '0.34.0',
    date: '2026-11-15',
    items: [
      "Verified by Teamtrail: `teamtrail proof <ticket>` prints what Teamtrail recorded about a ticket's completion (the checks it ran, criteria verified or only claimed, the review and the decisions it relies on), ready for a pull request",
      'Agents get the same report from the new `proof_report` tool and put it in their pull requests',
      'The report opens with a Teamtrail verified or not verified badge',
    ],
  },
  {
    version: '0.33.1',
    date: '2026-11-14',
    items: ['Teamtrail is now MIT licensed'],
  },
  {
    version: '0.33.0',
    date: '2026-11-14',
    items: [
      "`teamtrail connect claude` offers to turn on Claude Code's sandbox, so the agent's shell commands can't reach Teamtrail's config folder either",
    ],
  },
  {
    version: '0.32.0',
    date: '2026-11-13',
    items: [
      'Scout has a new look: a scout companion with a cap, a headset and an antenna, looking out along the trail',
    ],
  },
  {
    version: '0.31.1',
    date: '2026-11-13',
    items: ['An archived trail’s held work and changes waiting for your approval stay in your queue'],
  },
  {
    version: '0.31.0',
    date: '2026-11-13',
    items: [
      'Start a trail over: the trail menu archives the map that went wrong and opens New trail with its idea filled in',
      'Archive a trail you are done with, or restore it: it stays as history, and no agent takes work from it',
      'The empty map looks like every other empty zone, with New trail and the agent command under it',
    ],
  },
  {
    version: '0.30.0',
    date: '2026-11-12',
    items: [
      "Ask Scout more in Slack: “what's blocking #12?”, “what did we decide about retention?”, “who's working?”, as @Scout, a DM or /scout ticket, decisions and who",
      'In a channel, the answers are seen only by you',
    ],
  },
  {
    version: '0.29.3',
    date: '2026-11-12',
    items: ['@Scout inbox and status in a channel now show up right away, seen only by you'],
  },
  {
    version: '0.29.2',
    date: '2026-11-12',
    items: [
      'The Activity log reads in one style: a coloured bar marks what needs you (red), what went well (green) and what is held up (amber), and Slack answers show who gave them',
    ],
  },
  {
    version: '0.29.1',
    date: '2026-11-12',
    items: [
      'Scout says in Slack that it needs Teamtrail running on your computer, and how to start it, when it can’t reach yours',
      'Ask Scout in your own words: “@Scout what’s in my inbox?” or “status of Slack live test” work, in a channel or a DM',
    ],
  },
  {
    version: '0.29.0',
    date: '2026-11-12',
    items: [
      'Ask Scout in Slack: @Scout inbox or @Scout status in a channel answers only you, or DM Scout; if you added Scout before, Settings asks you to reconnect once',
      'A question your agent waits on gets its own Slack message with answer buttons, even right after it asked another one',
      'Scout can be installed straight from Slack (scout.teamtrail.app/install-slack); each person then connects in Settings → Slack',
    ],
  },
  {
    version: '0.28.0',
    date: '2026-11-12',
    items: [
      'Scout is now one Slack app: Settings → Slack → Add Scout to Slack, no app to create and no tokens to paste',
      'You confirm which Slack account becomes Scout’s owner before it connects; if you made your own Slack app before, add Scout again',
      'High-risk calls are answered in the Lookout only, and so is approving an agent’s request to change your settings: Slack shows Open in Lookout, and Decline still works there',
    ],
  },
  {
    version: '0.27.3',
    date: '2026-11-11',
    items: [
      'On Linux, the Lookout sees every change an agent makes to a ticket again, not only the first: a claimed ticket no longer stays in the queue as waiting',
    ],
  },
  {
    version: '0.27.2',
    date: '2026-11-11',
    items: [
      'Settings, briefs, criteria, guides, reroutes and the other panels stay current through reconnects, and a GitHub or Linear map updates live again',
    ],
  },
  {
    version: '0.27.1',
    date: '2026-11-11',
    items: ['The map and the queue no longer miss a change made while the Lookout was loading or reconnecting'],
  },
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
];
