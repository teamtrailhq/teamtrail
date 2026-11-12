import { useRef, useEffect, useState } from 'react';
import { slackApi } from './slackApi';
import { SlackAppCard } from './SlackAppCard';
import { SlackPreferences } from './SlackPreferences';
import { useConnectReturn } from './useConnectReturn';
import { useSlackStatus } from './useSlackStatus';

/** Settings → Slack. Hidden when there is no local server (a static build). */
export function SlackSettings(props: { focus?: boolean }) {
  const [s, setS] = useSlackStatus(3000);
  const back = useConnectReturn(setS);
  const [error, setError] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.focus && s) ref.current?.scrollIntoView({ block: 'start' });
  }, [props.focus, !!s]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const patch = (p: Parameters<typeof slackApi.update>[0]) => slackApi.update(p).then(setS, () => {});
  return (
    <div ref={ref} className="slack-settings">
      <SlackAppCard
        s={s}
        back={back}
        error={error ?? back.error}
        onError={setError}
        onToggle={() => void patch({ enabled: !s.enabled })}
        onChanged={(x) => {
          setError(undefined);
          setS(x);
        }}
      />
      {s.connected && <SlackPreferences s={s} patch={(p) => void patch(p)} />}
    </div>
  );
}
