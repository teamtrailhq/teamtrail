import { DEFAULT_GATES, type GateMode, type GateName } from '../model/gateMode';
import type { VerificationConfig } from '../model/verification';

/** The mode a gate runs in: the approved config's, else the default. Without a config, nothing is verified: off. */
export function gateModeFor(config: VerificationConfig | undefined, gate: GateName): GateMode {
  if (!config) return 'off';
  return config.gates?.[gate] ?? DEFAULT_GATES[gate];
}
