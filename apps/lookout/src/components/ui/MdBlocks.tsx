import type { MdBlock } from '../../lib/markdown';
import { MdText } from './MdText';

/** Parsed markdown blocks as React elements. Headings are bold lines, not document headings: a ticket has its own. */
export function MdBlocks({ blocks }: { blocks: MdBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'paragraph':
            return (
              <p key={i}>
                <MdText text={b.text} />
              </p>
            );
          case 'heading':
            return (
              <p key={i} className={`md-h md-h${Math.min(b.level, 3)}`}>
                <MdText text={b.text} />
              </p>
            );
          case 'list': {
            const items = b.items.map((item, k) => (
              <li key={k}>
                <MdBlocks blocks={item} />
              </li>
            ));
            if (b.ordered)
              return (
                <ol key={i} start={b.start === 1 ? undefined : b.start}>
                  {items}
                </ol>
              );
            return <ul key={i}>{items}</ul>;
          }
          case 'code':
            return (
              <pre key={i} className="md-pre">
                <code>{b.text}</code>
              </pre>
            );
          case 'quote':
            return (
              <blockquote key={i}>
                <MdBlocks blocks={b.blocks} />
              </blockquote>
            );
          case 'rule':
            return <hr key={i} />;
          default: {
            const never: never = b;
            return never;
          }
        }
      })}
    </>
  );
}
