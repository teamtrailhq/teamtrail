# The team demo

Five minutes, live: an agent has already explored a small app and written a brief. You approve the plan, two real MCP agents build it, Teamtrail checks their work and sends one ticket back, and they ask you two questions.

**The app:** Aisle, a React Native shopping app for a made-up fashion chain, Halden. **The trail:** _Store promos by geofence_: walk into a store's area and get its promo of the day, only if you turned promos on.

Everything lives in `.demo/` at the repo root (git-ignored) with its own config folder, so your projects, sign-ins and approvals are never touched. The Lookout runs on port 7480.

## Before the meeting

1. `npm run build -w teamtrail` (once, and after pulling).
2. Terminal 1: `npm run demo`. It builds the app, an agent charts the trail and submits the brief, then the Lookout opens in your browser.
3. In the browser, **Sign in this browser**, then **Get started** (Local markdown) on the first visit.
4. Terminal 2: type `npm run demo:build` but don't run it yet.
5. Rehearse once. `npm run demo` starts over from scratch every time (Ctrl+C the old one first).

## The five minutes

| When | You | Say |
| --- | --- | --- |
| 0:00 | The Hands-off home: Needs you has **Approve the plan** | An agent read the code and wrote a brief. Nothing gets built until I approve the plan. |
| 0:30 | Open the plan: the brief, four tickets, their acceptance criteria | Done is agreed before work starts. |
| 1:00 | Run `npm run demo:build`, then click **Approve the plan**. Switch to **Hands-on** for the map. | Two agents start: one builds, one takes the decision ticket. |
| 1:30 | **Promo notifications switch in Settings** fails its test, goes back to rework, then passes | The agent said done. Teamtrail ran the checks, and it wasn't. |
| 2:00 | A **high risk** question: _'Always' location or only 'While using'?_ Click an answer. | High risk, so only an answer here counts. Not Slack, not an agent's chat. |
| 3:00 | _How many promos per store per day?_ Click one. | A product call mid-work. My answer goes into the code and its test. |
| 4:00 | Open a done ticket's **Proof** | Each check, each criterion, the commit it covers. |
| 4:30 | **Destination reached**, verified together on main | Discovery and the decision have no code to check, so they show as not verified; the three code tickets are. Start with `npx teamtrail`. |

`DEMO_PACE=2 npm run demo:build` makes every step twice as slow, `DEMO_PACE=0.5` twice as fast. The order of the rework and the first question can swap; both are fine.

## If something goes wrong

- The sign-in link expired: `cd .demo/aisle && TEAMTRAIL_CONFIG_DIR=$PWD/../config node ../../packages/cli/dist/cli.js pair`.
- Anything else: Ctrl+C both terminals and run `npm run demo` again.
