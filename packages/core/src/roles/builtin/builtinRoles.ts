import { ARCHITECT_ROLE } from './architect';
import { DOCS_ROLE } from './docs';
import { QA_ROLE } from './qa';
import { REVIEWER_ROLE } from './reviewer';
import { SECURITY_ROLE } from './security';

/**
 * The roles bundled with Teamtrail, as role-file text by id. They are plain strings rather than `.md` imports so
 * every bundler (esbuild, Vite, vitest) loads them without a loader.
 */
export const BUILTIN_ROLES: Record<string, string> = {
  reviewer: REVIEWER_ROLE,
  qa: QA_ROLE,
  security: SECURITY_ROLE,
  docs: DOCS_ROLE,
  architect: ARCHITECT_ROLE,
};
