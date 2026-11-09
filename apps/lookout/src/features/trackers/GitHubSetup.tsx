import type { TrackerSettings, TrackerTestResult } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { GitHubIdentity } from './GitHubIdentity';
import { GitHubRepoChoice } from './GitHubRepoChoice';
import { tokenWorks } from './githubText';
import { GitHubTokenEntry } from './GitHubTokenEntry';
import { TestLine } from './TestLine';
import { trackerApi } from './trackerApi';
import { useGitHubRepos } from './useGitHubRepos';

/**
 * Connect GitHub Issues: shows the account and repo it will use and connects only on Connect. With a working
 * token (gh login, env, saved, signed in) the repo comes from a picker; without one, sign in with GitHub, or paste a
 * token and type the repo. `reload` fetches the settings again after signing in or out.
 */
export function GitHubSetup(props: {
  s: TrackerSettings;
  onConnected: () => void;
  reload: () => Promise<TrackerSettings | undefined>;
}) {
  const gh = props.s.github;
  const works = tokenWorks(gh);
  const [paste, setPaste] = useState(!works);
  const [repo, setRepo] = useState(gh.repo ?? gh.detectedRepo ?? '');
  const [token, setToken] = useState('');
  const [result, setResult] = useState<TrackerTestResult>();
  const [busy, setBusy] = useState(false);
  const { list, retry } = useGitHubRepos({ enabled: !paste, auth: gh.auth });
  // `gh auth login` in a terminal: the next settings poll finds the token and the picker takes over.
  useEffect(() => {
    if (works && !token) setPaste(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [works]);
  const connect = async () => {
    setBusy(true);
    setResult(undefined);
    try {
      await trackerApi.connect({ active: 'github', github: { repo, token: paste ? token : undefined } });
      props.onConnected();
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      setBusy(false);
    }
  };
  const signedIn = async () => {
    const s = await props.reload();
    if (s && tokenWorks(s.github)) setPaste(false);
  };
  const signOut = async () => {
    await trackerApi.githubSignIn.signOut().catch(() => undefined);
    const s = await props.reload();
    setPaste(!s || !tokenWorks(s.github));
  };
  const loading = !paste && !list;
  const ready = !!repo && !loading && (!paste || !!token || works);
  return (
    <div className="card inset tracker-setup">
      {paste ? (
        <GitHubTokenEntry gh={gh} token={token} onToken={setToken} repo={repo} onRepo={setRepo} onSignedIn={signedIn} />
      ) : (
        <>
          <GitHubIdentity gh={gh} repo={repo} onUseAnother={() => setPaste(true)} onSignOut={() => void signOut()} />
          <GitHubRepoChoice list={list} detected={gh.detectedRepo} value={repo} onChange={setRepo} onRetry={retry} />
        </>
      )}
      <TestLine r={result} />
      <footer>
        <button type="button" className="btn primary" disabled={busy || !ready} onClick={() => void connect()}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </footer>
    </div>
  );
}
