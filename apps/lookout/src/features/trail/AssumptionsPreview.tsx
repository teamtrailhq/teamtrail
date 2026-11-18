import { MdText } from '../../components/ui';

/** The assumptions as the trail will list them: numbered S-1, S-2, … in the order written. */
export function AssumptionsPreview({ lines }: { lines: string[] }) {
  return (
    <ol className="doc-assumption-list">
      {lines.map((line, i) => (
        <li key={i}>
          <span className="t-code">S-{i + 1}</span> <MdText text={line} />
        </li>
      ))}
    </ol>
  );
}
