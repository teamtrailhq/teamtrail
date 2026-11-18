/**
 * Whether a proof's commit (`proof.git.head`) is the pull request's head: the one rule Teamtrail's posted status
 * (proofStatus.ts) and `teamtrail proof verify` (verifyProofText.ts) share. A proof that names no commit covers none,
 * so it never passes on whatever a PR's head happens to be, a force-push included. Either side may be abbreviated
 * (at least 7 characters); case doesn't matter.
 */
export function coversHead(head: string | null | undefined, sha: string): boolean {
  const a = head?.toLowerCase() ?? '';
  const b = sha.toLowerCase();
  if (a.length < 7 || b.length < 7) return false;
  return a.startsWith(b) || b.startsWith(a);
}
