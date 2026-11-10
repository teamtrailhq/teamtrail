import { Button, Loading, MetaLine } from '../../components/ui';
import { GitHubDeviceCode } from './GitHubDeviceCode';
import { useGitHubSignIn } from './useGitHubSignIn';

/**
 * Sign in with GitHub, for people with no gh login or token: a code to enter on github.com, then Teamtrail keeps the
 * token on this machine (never in the repo). Shown only when Teamtrail has an OAuth app to sign in with.
 */
export function GitHubSignIn(props: { onSignedIn: () => Promise<void> | void }) {
  const { state, start, cancel } = useGitHubSignIn(props.onSignedIn);
  switch (state.kind) {
    case 'idle':
      return (
        <div className="gh-sign-in">
          <Button variant="primary" onClick={start}>
            Sign in with GitHub
          </Button>
          <MetaLine parts={['No gh login or token needed', 'the token stays on this machine']} />
          <MetaLine
            parts={['GitHub asks for access to your repos: it has no narrower scope for issues in private repos']}
          />
        </div>
      );
    case 'starting':
      return <Loading label="Asking GitHub for a code…" />;
    case 'code':
      return <GitHubDeviceCode code={state.userCode} href={state.verificationUri} onCancel={cancel} />;
    case 'ended':
      return (
        <div className="gh-sign-in">
          <Button onClick={start}>Try again</Button>
          <MetaLine parts={["Didn't sign in", state.reason]} />
        </div>
      );
    default: {
      const never: never = state;
      return never;
    }
  }
}
