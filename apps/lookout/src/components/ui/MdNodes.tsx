import type { MdInline } from '../../lib/markdown';

/**
 * Parsed inline markdown as React elements: text through React (escaped, never HTML), links that open in a new tab
 * without a referrer, to a URL `webUrl` already accepted.
 */
export function MdNodes({ nodes }: { nodes: MdInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case 'text':
            return n.text;
          case 'break':
            return <br key={i} />;
          case 'code':
            return (
              <code key={i} className="md-code">
                {n.text}
              </code>
            );
          case 'strong':
            return (
              <strong key={i}>
                <MdNodes nodes={n.children} />
              </strong>
            );
          case 'em':
            return (
              <em key={i}>
                <MdNodes nodes={n.children} />
              </em>
            );
          case 'del':
            return (
              <del key={i}>
                <MdNodes nodes={n.children} />
              </del>
            );
          case 'link':
            return (
              <a key={i} href={n.href} target="_blank" rel="noreferrer noopener">
                <MdNodes nodes={n.children} />
              </a>
            );
          default: {
            const never: never = n;
            return never;
          }
        }
      })}
    </>
  );
}
