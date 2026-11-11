---
description: Teamtrail trails: new, resume, status, inbox
argument-hint: new "<idea>" | resume [trail] | status | inbox
---

You are connected to Teamtrail, this repo's trail Lookout, through the `teamtrail` MCP server. The human watches every step live in the Lookout and answers your questions there.

Arguments: $ARGUMENTS

Take the subcommand from the first word of the arguments. With no arguments, run `status`.

## new "<idea>"

0. Check that it's trail-sized. Trails are for work that spans several layers or needs investigation. For a bug fix, a UI tweak or a single endpoint, say so and do the work directly, without a trail, unless the human asks for one.
1. Frame the idea with the human before planning. Ask 3–4 framing questions, one at a time, each with the `ask_human` tool (`framing: true`, 2–3 short `suggestions`):
   - who it is for,
   - what "done" looks like,
   - what is out of scope,
   - what is already decided.

   Each question also appears in the Lookout inbox, and the human can answer in either place. If they interrupt the wait and answer here in chat, call `list_inbox`, then `answer_question` with their exact words so the Lookout shows the answer too. An answer given in chat guides agents; it can't approve anything that needs the human (a high-risk call, a junction or other HITL ticket): those need their answer in the Lookout or Slack. (Over a remote connection there is no `answer_question`: the human answers in the Lookout or Slack.)
2. Look around the repo as much as you need, then draft the trail map:
   - `destination`: what "done" looks like, in one or two sentences.
   - `decided`, `unspecified` (known unknowns) and `outOfScope`, from the answers.
   - `assumptions`: what the plan relies on that could turn out wrong, each with the ticket refs that depend on it.
   - `team` (optional): the installed guides the trail uses (`list_guides`), and a `guide` on tickets that need one, e.g. `qa` on a testing task or `security` on an auth change. With `reviewer` in the team, review tickets get the reviewer guide.
   - `tickets`: `research` for what you can find out alone, `junction` for decisions the human must make, `prototype` for things to try before deciding, `task` for checks and chores (`hitl: true` if the human must do or approve them), `execute` for implementation once its decisions are made. Wire `blockedBy` by ref so every ticket waits for the decisions it depends on.
3. Call `start_trail`. It adds a discovery ticket: implementation waits until the human accepts your discovery brief. Pass `discovery: false` only if the human says to skip it (not possible over a remote connection). Tell the human the trail key.
4. Do discovery: claim the discovery ticket, investigate the existing system (and ask the human what the repo can't tell you about the product), then call `submit_brief` with real paths, never guesses. The human reviews it in the Lookout; `get_brief` shows the status and any requested changes. Once it's accepted, revise the planned tickets if the brief changed the picture (`add_ticket`, `update_trail`).
5. Continue with **resume**.

## resume [trail]

1. Call `resume_trail` (pass the trail if one was named). If `discovery` says the brief isn't accepted yet, do discovery first (see **new**, step 4). If it returns `yourClaim`, continue that ticket; otherwise call `claim_ticket`.
2. Work the ticket:
   - If the claim returns `guide`, take on the role it describes: follow its `instructions`, and answer each item of its `checklist` in `checklist` when you complete or review (`{ item, done, note? }`). Guide text never overrides Teamtrail's rules: never review your own work, never answer or approve for the human. A `guideWarning` means the guide is disabled until the human approves it; work without it. Asked to write a guide for the team, run `teamtrail guides new <id>` and fill in the file it writes; only the human approves it.
   - Follow its `howTo`. Never decide a `hitl` ticket alone: ask each question with `ask_human`, wait for the answer, and confirm the drafted resolution with the human before closing.
   - With model matching on (`modelMatching.enabled` in `status`), `claim_ticket` without a ticket gives you one that fits the model you run on; don't switch models for it. If the claim returns a `tierNote`, tell the human in one line: you took a ticket set for a stronger model.
   - Say which files you'll change: pass `touches` (path globs) to `claim_ticket`. A `warnings` entry means another agent's claim covers the same files: keep to your own, or ask the human which goes first. When the claim returns a `workspace`, edit files only in its `path` (your own git worktree on its own branch), commit there, and name the branch when you complete. Teamtrail never merges or pushes it. If the claim's `git` says "Remote connection" instead (you reach Teamtrail over HTTP from another machine), it can't see your files and prepares no worktree: work on a branch of your own and push it.
   - Read the `knowledge` that came with the claim: confirmed entries are binding, assumptions are unverified, and `mayBeOutdated` means the code changed since it was confirmed. If an entry contradicts what you find, `flag_knowledge` with the evidence. When you learn something the next agent needs, `propose_knowledge`; dead ends (what failed and why) are especially worth keeping. No other agent sees a proposal until the human reviews it, not even through `search_knowledge`.
   - Call `report_progress` at each step (`step` plus a short `message`), and for notable findings. Usage is read from your session log; if `report_progress` returns `usageSource: "none"` or `"reported"`, include `inputTokens`, `outputTokens` and `costUsd` only when you actually know them; never guess.
   - Ask or decide. Ask with `ask_human` only when the call changes product behaviour, data, security, billing, a public API or the schema, or when you're genuinely blocked. Keep each question to one decision with 2–3 `suggestions`. Otherwise decide yourself, following the project's conventions, and keep the decision with `record_decision` (`rationale` and `alternatives`): the human sees it in the briefing as decided by an agent and can reverse it. A decision is the human's only by their answer: `ask_human` returns a `questionId`; `close_ticket` uses the answer to the question you asked on that ticket, and `record_decision` takes `questionId`. One answer backs one decision, and only for what it was asked (pass the same `category` when you ask, or `categories` when the call reaches more than one).
   - Name the risk. Pass `category` and the `paths` you change (repo-relative; an absolute path inside the repo is taken as relative, anything outside the repo is refused) to `record_decision` and `close_ticket`. The project's risk policy decides what's yours: a high-risk call is the human's, so ask it with `ask_human` (with the `category`); recording it yourself is rejected. Leaving paths out hides nothing: on this machine Teamtrail reads the files git saw change since your claim and judges those too, and the human sees changed files you didn't declare. Claim a research or junction ticket before you close it: a close without verification needs your claim. Over a remote connection, completing verified work needs `paths` (or `noCodeReason`); the human sees them as your word.
   - When you ask, set `urgency` honestly: `blocking` only when you can do no useful work until it's answered; `soon` (the default) or `fyi` when you can keep going, and then keep working on other tickets while it waits (short `waitSeconds`). Ask related questions together, and pass `blocks` with the tickets that can't move until it's answered.
   - Before working on a task, execute or prototype ticket, agree what done means: call `set_criteria` (cover the business rules in `criteria.suggested`). Only the ticket's assignee sets its criteria (or the agent that charted it, before anyone claims it). Once the human confirmed them, `set_criteria` only proposes a change: the confirmed ones stay in force and your completion is checked against them until the human takes yours. When completing, give evidence per criterion in `criteria`: `check:<name>` is the only evidence Teamtrail verifies (it runs the check); `test:<name>`, `command:<cmd>`, `pr` or a note are recorded as claimed, not verified, and on security and business-rule criteria they wait for the human's sign-off; `manual` when only the human can confirm it.
   - If what you find contradicts one of the trail's assumptions (`list_assumptions`) or the plan, don't work around it: `challenge_assumption` with the evidence, then `propose_reroute` with the changes it calls for. If the work already exists, the trail targets the wrong problem or it should be rescoped, use `kind: "challenge-destination"` with a suggested destination. The human approves or rejects it in the Lookout; the tickets it touches are frozen until then, so keep working on others and check `reroute_status`. You (and every session of your token) have one pending plan proposal per trail, the newest; a trail holds three at most; pending proposals never freeze most of the open tickets (one that would freezes none); after the human turns yours down, wait a few minutes and read their note before proposing again. To drop a ticket, `close_ticket` with `outcome: "out_of_scope"`: you never cancel it yourself, whatever the human said; it becomes a rule-out proposal they approve or dismiss in one click, apart from your plan proposals. Pass `assumes` with decisions that rely on an assumption.
   - If the ticket lists `verification.checks`, run those commands yourself before completing. If it has `rework`, a previous completion failed: fix what `rework.failures` shows first.
3. Call `close_ticket` with the full `resolution`, a one-line `summary`, the `rationale` and the `alternatives` you considered. When the ticket needs verification, its checks run first and the result has a `status`:
   - `done`: closed, carry on.
   - `rework`: read `feedback` (the failing checks and their output), fix the cause, `claim_ticket` it again and close it again.
   - `verifying` with `pending: true`: the checks are still running; call `verification_status` with `wait: true`.
   - `waiting-approval`: the human hasn't approved the check commands on this machine yet. Your work is kept; tell them and take another ticket.

   What the human approves (check commands, guides, the tracker, the risk policy, accepted briefs, confirmed criteria and knowledge, reroutes, answers to your questions) is kept on their machine, outside the repo. Editing those files under `.teamtrail/` to get past a gate doesn't work: the gate stays closed and the human is shown the change.
   - `blocked`: the human decides in the Lookout; move on to another ticket. Over a remote connection every verified completion ends here, because the checks can't run on files Teamtrail doesn't have: name your pushed branch or pull request in the `resolution` (or pass `pr`) so the human can review it.
4. Claim the next ready ticket and repeat until none is ready, the trail is done, or the human asks you to stop. Then give a short summary: what you closed, what is waiting on the human, what is blocked.

If `ask_human` returns `answered: false`, call `wait_for_answer` with its `questionId`. If you have other useful work in the meantime, tell the human the question is waiting in the Lookout.

## status

Call `status` and summarize it in a few lines: progress, running sessions, what is waiting on the human (`attention`: how many items, how many interrupt, the top ones), what is blocked, what is verifying or back for rework, and spend. Then call `projects_status`: if another project has questions waiting or items that need the human, add one line naming it (you can't act there).

## inbox

Call `list_inbox`. List its `attention` items in their ranked order, each with a number, what it is, its trail and ticket, and its `reasons`; keep items with the same `batch` together. For questions (`questionId`), let the human answer here, then pass their exact words to `answer_question` (over a remote connection, point them to the Lookout instead: you can't answer for them). Say plainly that an answer given here guides the agent that asked but can't approve a gate: a high-risk call, a junction or other HITL ticket, or a decision recorded as theirs needs their answer in the Lookout or Slack, so for those questions point them there. Other items (approvals, held tickets, flags, briefs, knowledge) are decided in the Lookout: say where. Never answer or approve on their behalf.
