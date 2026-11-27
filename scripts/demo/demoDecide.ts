import { checklistOf } from './checklistOf';
import { claimWhenReady } from './claimWhenReady';
import type { Call } from './demoChart';
import { beat } from './pace';

const ALWAYS = "'Always': promos arrive in the background";
const WHILE_USING = "'While using': promos only with the app open";

/**
 * The second agent takes the junction once the build starts: it asks the trail lead the location question, high
 * risk (auth-permissions), so only an answer in the Lookout counts, and records their call. True for 'Always'.
 */
export async function decide(o: { call: Call; key: string; after: Promise<void> }): Promise<boolean> {
  await o.after;
  await beat(4);
  const claimed = await claimWhenReady({ call: o.call, key: o.key, who: 'codex' });
  console.log(`codex · claimed ${claimed.key} ${claimed.title}`);
  await o.call('report_progress', {
    trail: '#1',
    step: 'Resolve',
    message: 'Comparing what each location permission allows on iOS and Android',
  });
  await beat(4);
  const asked = await o.call('ask_human', {
    question:
      "Geofences only fire in the background with 'Always' location access. iOS asks for it in two steps and many shoppers decline it; 'While using' is easier to grant but promos then only arrive while Aisle is open. Which do we ask for?",
    summary: "Ask shoppers for 'Always' location, or only 'While using'?",
    suggestions: [ALWAYS, WHILE_USING],
    category: 'auth-permissions',
    urgency: 'blocking',
    blocks: [o.key],
    waitSeconds: 3600,
  });
  if (!asked.answered) throw new Error('no answer to the location question within the hour');
  console.log(`codex · answered: ${asked.answer}`);
  const always = /always/i.test(asked.answer) && !/while using/i.test(asked.answer);
  await o.call('close_ticket', {
    trail: '#1',
    ticket: o.key,
    resolution: `Decided with the trail lead: ${asked.answer}.`,
    questionId: asked.questionId,
    rationale: 'Location access is the shopper’s trust in Aisle: the trail lead made the call.',
    alternatives: [ALWAYS, WHILE_USING].filter((x) => x !== asked.answer),
    category: 'auth-permissions',
    ...checklistOf(claimed),
  });
  console.log(`codex · closed ${o.key}`);
  return always;
}
