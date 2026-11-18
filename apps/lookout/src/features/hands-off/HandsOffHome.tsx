import type { ReactNode } from 'react';

/**
 * Hands-off's home, in place of the map: one centred column, most important first: what needs you, progress on the
 * trail, what happened since you were away, and today's merged work.
 */
export function HandsOffHome(props: { needs: ReactNode; progress: ReactNode; since: ReactNode; footer: ReactNode }) {
  return (
    <div className="hands-off-home">
      <div className="home-column">
        {props.needs}
        {props.progress}
        {props.since}
        {props.footer}
      </div>
    </div>
  );
}
