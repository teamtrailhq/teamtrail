import type { GateMode } from '../model/gateMode';
import { trustedChecks } from './checksApproval';
import { gateModeFor } from './gateModeFor';

/** The `independent-review` gate's mode, from the verification.json approved on this machine. */
export const reviewGateMode = (root: string): GateMode =>
  gateModeFor(trustedChecks(root).config.config, 'independent-review');
