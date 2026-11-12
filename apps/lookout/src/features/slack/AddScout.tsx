import { useState } from 'react';
import { Button } from '../../components/ui';
import { slackApi } from './slackApi';

/**
 * Add Scout to Slack: the server keeps a PKCE verifier and answers the address that starts Slack's consent screen,
 * through Teamtrail's Scout service. Slack sends the browser back here when it's done.
 */
export function AddScout(props: { again?: boolean; onError: (message: string) => void }) {
  const [going, setGoing] = useState(false);
  const add = () => {
    setGoing(true);
    slackApi.connectStart().then(
      (r) => location.assign(r.url),
      (e: Error) => {
        setGoing(false);
        props.onError(e.message);
      },
    );
  };
  return (
    <Button size="sm" variant="primary" disabled={going} onClick={add}>
      {props.again ? 'Add Scout to Slack again' : 'Add Scout to Slack'}
    </Button>
  );
}
