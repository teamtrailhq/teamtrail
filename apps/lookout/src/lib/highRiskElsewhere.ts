import { managedSignIn } from './managedSignIn';

/** What this page says where a high-risk call waits on someone else: who may make it. */
export const HIGH_RISK_ELSEWHERE =
  'This is a high-risk call: only an owner, or someone they allowed to make high-risk calls, can make it. It waits for them.';

/** Whether this person may not make high-risk calls here (an embedding server's sign-in said so). */
export const highRiskElsewhere = () => managedSignIn()?.highRisk === false;
