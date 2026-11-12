import type { SlackStatus } from '@teamtrail/connector-slack';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { slackApi } from './slackApi';

/** Disconnect, then confirm: the link is revoked at Teamtrail's Scout service and Slack is forgotten here. */
export function SlackRemove({ onRemoved }: { onRemoved: (s: SlackStatus) => void }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
        Disconnect
      </Button>
    );
  }
  const remove = () =>
    void slackApi.disconnect().then(
      (x) => {
        setConfirm(false);
        onRemoved(x);
      },
      () => {},
    );
  return (
    <>
      <Button size="sm" variant="danger" onClick={remove}>
        Disconnect and forget Slack settings
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
        Keep
      </Button>
    </>
  );
}
