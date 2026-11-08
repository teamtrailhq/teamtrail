import { ARCHITECT_GUIDE } from './architect';
import { DOCS_GUIDE } from './docs';
import { QA_GUIDE } from './qa';
import { REVIEWER_GUIDE } from './reviewer';
import { SECURITY_GUIDE } from './security';

/**
 * The guides bundled with Teamtrail, as guide-file text by id. They are plain strings rather than `.md` imports so
 * every bundler (esbuild, Vite, vitest) loads them without a loader.
 */
export const BUILTIN_GUIDES: Record<string, string> = {
  reviewer: REVIEWER_GUIDE,
  qa: QA_GUIDE,
  security: SECURITY_GUIDE,
  docs: DOCS_GUIDE,
  architect: ARCHITECT_GUIDE,
};
