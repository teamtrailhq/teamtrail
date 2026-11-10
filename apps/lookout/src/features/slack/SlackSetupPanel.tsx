import { type SlackStatus, type SlackTokenResult, appIdFromToken, slackLinks } from '@teamtrail/connector-slack';
import { BRAND, webUrl } from '@teamtrail/core';
import { useState, type ReactNode } from 'react';
import { Meta, Card } from '../../components/ui';
import { ExtLink } from './ExtLink';
import { OwnerStep } from './OwnerStep';
import { PasteToken } from './PasteToken';
import { slackApi } from './slackApi';
import { StepFact } from './StepFact';
import { STEPS, isDone, isCurrent, stepClass } from './steps';
import { useTokenPickup, PASTE_KEY } from './useTokenPickup';

/**
 * The five-step guided setup. Each step turns green once the local server verifies it; the last one once the
 * trail lead confirms which Slack account is theirs. The state lives in the user's config folder, so closing the browser resumes at the same step.
 */
export function SlackSetupPanel(props: { s: SlackStatus; set: (s: SlackStatus) => void }) {
  const { s, set } = props;
  const [result, setResult] = useState<SlackTokenResult>();
  const [busy, setBusy] = useState(false);
  const [installOpened, setInstallOpened] = useState(false);
  const onToken = (token: string, gesture: boolean) => {
    const appId = appIdFromToken(token);
    // The install page is the next stop anyway; open it while the paste still counts as a click.
    if (gesture && appId && !s.setup.botToken && window.open(slackLinks.install(appId), '_blank'))
      setInstallOpened(true);
    setBusy(true);
    void slackApi
      .token(token)
      .catch((e: Error) => ({ ok: false, error: e.message, status: s }) as SlackTokenResult)
      .then((r) => {
        setBusy(false);
        setResult(r);
        set(r.status);
      });
  };
  const auto = useTokenPickup(onToken);
  const pickup = auto ? 'come back to this tab' : `press ${PASTE_KEY} here`;
  const step = s.step;
  /** The last token test shows under the step it belongs to: the bot token under Install, the app token elsewhere. */
  const line = (n: number) => {
    if (!result) return null;
    const failedHere = !result.ok && (n === 4) === (step === 4);
    const forThisStep = result.kind === (n === 4 ? 'bot' : 'app') || failedHere;
    if (!forThisStep) return null;
    return <div className={`test-line ${result.ok ? 'ok' : 'alert'}`}>{resultText(result)}</div>;
  };
  const body: Record<number, ReactNode> = {
    1: (
      <>
        <p>
          Create your app in Slack. It opens filled in from a manifest, so your app already has the {s.command} command,
          Save as decision and Socket Mode.
        </p>
        <div className="sl-actions">
          <ExtLink primary href={s.links.create} onClick={() => void slackApi.created().then(set, () => {})}>
            Create your Slack app
          </ExtLink>
        </div>
      </>
    ),
    2: (
      <p>
        In Slack: pick your workspace → <b>Next</b> → <b>Create</b>. Your app lives in the workspace you pick.
      </p>
    ),
    3: (
      <>
        <p>
          Give your app a token so Scout can connect from this machine. On the page Slack just opened:{' '}
          <b>App-Level Tokens</b> → <b>Generate Token and Scopes</b> → name it <code>teamtrail</code> → add{' '}
          <code>connections:write</code> → <b>Generate</b> → <b>Copy</b>, then {pickup}.
        </p>
        <div className="sl-actions">
          <PasteToken busy={busy} placeholder="xapp-…" onToken={onToken} />
        </div>
        {line(3)}
        <Meta
          className="dim"
          parts={[
            'Waiting for the app-level token',
            s.links.create && (
              <a key="again" href={webUrl(s.links.create)} target="_blank" rel="noreferrer">
                Open the manifest again
              </a>
            ),
          ]}
        />
      </>
    ),
    4: (
      <>
        <p>
          Install your app so Scout can post and DM you.{' '}
          {installOpened ? (
            "Slack's install page is open in a new tab: "
          ) : (
            <>
              <b>Install to workspace</b> →{' '}
            </>
          )}
          <b>Allow</b> → copy the <b>Bot User OAuth Token</b> (starts with <code>xoxb-</code>), then {pickup}.
        </p>
        <div className="sl-actions">
          <ExtLink primary={!installOpened} href={s.links.install}>
            {installOpened ? 'Open install page again' : 'Install to workspace'}
          </ExtLink>
          <PasteToken busy={busy} placeholder="xoxb-…" onToken={onToken} />
        </div>
        {line(4)}
      </>
    ),
    5: <OwnerStep s={s} set={set} />,
  };
  return (
    <Card tone="inset" className="slack-setup">
      <p className="sl-own">
        You create your own Scout app in your Slack workspace. It runs from this machine over Socket Mode; nothing goes
        through {BRAND.name}. Prefer one click? Add to Slack is coming with {BRAND.name} Cloud.
      </p>
      <ol className="pipeline sl-pipeline" aria-label="Slack setup">
        {STEPS.map((x) => (
          <li key={x.n} className={stepClass(step, x.n)}>
            <i />
            <span>
              {x.n} {x.title}
            </span>
          </li>
        ))}
      </ol>
      <ol className="sl-steps">
        {STEPS.map((x) => {
          const done = isDone(step, x.n);
          const cur = isCurrent(step, x.n);
          return (
            <li key={x.n} className={stepClass(step, x.n)}>
              <div className="sl-step-h">
                <span className="sl-n">{done ? '✓' : x.n}</span>
                <b>{x.title}</b>
                {done && <StepFact s={s} n={x.n} />}
              </div>
              {cur && <div className="sl-step-b">{body[x.n]}</div>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function resultText(r: SlackTokenResult) {
  if (!r.ok) return `✕ ${r.error}`;
  if (r.kind === 'app') return `✓ Socket Mode reachable · app ${r.status.setup.appId}`;
  return `✓ Installed in ${r.status.workspace?.name} as @${r.status.bot?.name ?? 'scout'}`;
}
