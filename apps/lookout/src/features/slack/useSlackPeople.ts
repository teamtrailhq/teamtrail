import { useEffect, useState } from 'react';
import type { SlackPeople } from '../../lib/actorLabel';
import { slackApi } from './slackApi';

let shared: Promise<SlackPeople | undefined> | undefined;

/** One load per page of the Slack people the Lookout can name; undefined until loaded or without Slack. */
function loadPeople() {
  shared ??= slackApi.get().then(
    (s) => ({ owners: s.owners ?? [], allow: s.allow ?? [] }),
    () => undefined,
  );
  return shared;
}

/** The owner and allowed users from Settings → Slack, for naming `slack:<id>` actors. */
export function useSlackPeople() {
  const [people, setPeople] = useState<SlackPeople>();
  useEffect(() => {
    let live = true;
    void loadPeople().then((p) => live && setPeople(p));
    return () => {
      live = false;
    };
  }, []);
  return people;
}
