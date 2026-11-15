import { managedSignIn } from './managedSignIn';

/** The server's page for turning its agents on, when it runs agents itself (managedSignIn.ts); else undefined. */
export const hostedAgents = () => managedSignIn()?.agents;

/** Going to that page. */
export const openHostedAgents = () => {
  const page = hostedAgents();
  if (page) location.assign(page.href);
};
