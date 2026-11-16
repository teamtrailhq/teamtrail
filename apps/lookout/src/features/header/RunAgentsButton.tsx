import { Button } from '../../components/ui';
import { hostedAgents } from '../../lib/hostedAgents';

/**
 * In a hosted Lookout whose server runs agents itself (lib/hostedAgents.ts): straight to this trail's row on the
 * server's agents page, where its agents are turned on and their runs show. Nothing elsewhere.
 */
export function RunAgentsButton({ mapId }: { mapId: string }) {
  const page = hostedAgents();
  if (!page) return null;
  const open = () => location.assign(`${page.href}#trail-${encodeURIComponent(mapId)}`);
  return (
    <Button size="sm" onClick={open} data-tip="Turn your agents on for this trail, or see them at work">
      Run agents
    </Button>
  );
}
