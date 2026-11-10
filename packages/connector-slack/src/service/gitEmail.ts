import { gitConfigValue } from '@teamtrail/core/agents';

/** This person's git email, read the way every git call of Teamtrail's is (no full environment, no repo commands). */
export const gitEmail = (cwd: string) => gitConfigValue(cwd, 'user.email');
