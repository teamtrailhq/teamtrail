/**
 * How one person uses the Lookout. `hands-off` (the default, for everyone): a home of what needs them, a progress
 * strip and what happened since they were away. `hands-on`: the map and every view. The mode changes what the person
 * sees and how they are asked, never what agents may decide (the project's risk policy) and never verification.
 * Kept per person: in `attention.json` in their config dir (`AttentionPrefs.mode`), or by an embedding server.
 */
export type LookoutMode = 'hands-off' | 'hands-on';

export const LOOKOUT_MODES: LookoutMode[] = ['hands-off', 'hands-on'];

export const DEFAULT_LOOKOUT_MODE: LookoutMode = 'hands-off';

/** A person's mode from what was saved: anything but a known mode is the default. */
export const lookoutModeOf = (v: unknown): LookoutMode => LOOKOUT_MODES.find((m) => m === v) ?? DEFAULT_LOOKOUT_MODE;
