/**
 * How far the repo profile reads (detectRepoProfile.ts), so a huge repo costs the same as a small one: folders this
 * deep below the top, this many folders listed, files read and units kept, and files larger than this skipped.
 */
export const PROFILE_LIMITS = {
  depth: 4,
  folders: 400,
  reads: 400,
  units: 40,
  textBytes: 256 * 1024,
  ci: 30,
  variables: 40,
} as const;
