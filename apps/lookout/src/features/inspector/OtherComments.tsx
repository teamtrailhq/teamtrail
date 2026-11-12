import type { Comment } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { actorLabel } from '../../lib';
import { useSlackPeople } from '../slack';

/** The ticket's comments besides its resolution, folded away. */
export function OtherComments({ comments }: { comments: Comment[] }) {
  const people = useSlackPeople();
  if (!comments.length) return null;
  const plural = comments.length > 1 ? 's' : '';
  return (
    <details className="comments">
      <summary className="t-label">
        {comments.length} other comment{plural}
      </summary>
      {comments.map((c) => (
        <div key={c.id} className="comment">
          <MetaLine parts={[{ text: actorLabel(c.author, people), strong: true }]} />
          <div className="c-body">{c.body.replace(/\*\*/g, '')}</div>
        </div>
      ))}
    </details>
  );
}
