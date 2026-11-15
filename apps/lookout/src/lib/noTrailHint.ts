import { hostedAgents } from './hostedAgents';

/** What starts a trail here: your own agent's chat, or the server's agents once you turn them on. */
export function noTrailHint() {
  const page = hostedAgents();
  if (page)
    return `Describe your idea here, then turn your agents on for it in ${page.label}. Scout frames it with you here, then they get to work.`;
  return 'Describe your idea here, or start it in Claude Code or Codex. Scout frames it with you, then your agents get to work.';
}
