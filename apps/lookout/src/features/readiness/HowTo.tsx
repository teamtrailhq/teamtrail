import { Disclosure } from '../../components/ui';
import { CopyField } from '../remote-agents';

/** What the person does themselves (install, start a service, set a variable), as lines to copy, behind a click. */
export function HowTo(props: { lines?: string[] }) {
  if (!props.lines?.length) return null;
  return (
    <Disclosure label="How to fix it yourself">
      {props.lines.map((line) => (
        <CopyField key={line} label="To run yourself" value={line} />
      ))}
    </Disclosure>
  );
}
