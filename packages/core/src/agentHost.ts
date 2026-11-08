/** Node side of the agent link (agentLink.ts): session docs, answers and the lookout lock under a tracker root. */
export { AgentDocWriter } from './agents/agentDocWriter';
export { TRAIL_NAMES_DIR, claimTrailName } from './agents/trailNameClaim';
export { AnswerError, readAgentDoc, readAgentDocs, writeAgentAnswer } from './agents/agentDocs';
export { readLookoutLock, writeLookoutLock } from './agents/lookoutLock';
export { writeJsonAtomic } from './lib/jsonFile';
export { dropLease, readLease, readLeases, renewLease, writeLease } from './agents/leaseStore';
export { LEASE_REAPER, reclaimExpired, returnToQueue, type ReturnOutcome } from './agents/returnToQueue';
export { journalFile, journalPath, JOURNAL_DIR } from './history/journalFile';
export { briefPath, readBrief, writeBrief } from './discovery/briefStore';
export { criteriaOf, readCriteria, writeTicketCriteria } from './criteria/criteriaStore';
export { POLICY_FILE, policyPath, readPolicy, writePolicy, type PolicyRead } from './policy/policyStore';
export {
  createReroute,
  listAllReroutes,
  listReroutes,
  readReroute,
  REROUTES_DIR,
  writeReroute,
} from './planning/reroute/rerouteStore';
export {
  proposeReroute,
  rerouteView,
  RerouteInvalid,
  type ProposeInput,
  type RerouteEnv,
} from './planning/reroute/rerouteFlow';
export { approveReroute, rejectReroute, type RerouteDecision } from './planning/reroute/decideReroute';
export {
  blobHash,
  listKnowledge,
  nextKnowledgeId,
  readKnowledge,
  repoRootFor,
  writeKnowledge,
} from './knowledge/knowledgeStore';
export { configHash, readVerificationConfig, VERIFICATION_FILE, type ConfigRead } from './verification/configFile';
export { checkPassed, runCheck, MAX_LOG_BYTES, type CheckRun } from './verification/runCheck';
export { runChecks, type ChecksOutcome } from './verification/runChecks';
export {
  EVIDENCE_DIR,
  evidencePaths,
  nextAttemptId,
  readAttempt,
  readAttempts,
  readVerdicts,
  writeAttempt,
  writeVerdict,
} from './verification/evidenceStore';
export {
  acquireRunLock,
  readRunLock,
  readRunLocks,
  recoverInterrupted,
  releaseRunLock,
  RUNS_DIR,
  type RunLock,
} from './verification/runLock';
export { attemptComment, checkLine, outcomeOf, type Outcome } from './verification/outcome';
export {
  CHECK_RUNNER,
  levelFor,
  repoRootOf,
  rerun,
  verify,
  type Settled,
  type Submission,
  type VerifyEnv,
} from './verification/verifyCompletion';
export { operatorAction, type OperatorAction, type OperatorRequest } from './verification/operatorActions';
export { approvalItems, type ApprovalItem } from './verification/approvals';
export { rerunChecks } from './verification/operatorRerun';
export { reviewConflict, type Reviewer } from './verification/reviewIndependence';
export { reviewBody, requestReview } from './verification/reviewRequest';
export { submitReview, type ReviewResult, type ReviewSubmission } from './verification/submitReview';
export { LOG_VIEW_BYTES, readEvidenceLog, ticketEvidence } from './verification/ticketEvidence';
export { baselineForClaim, captureBaseline, latestBaseline, readBaseline, type ClaimInfo } from './evidence/baseline';
export { collectEvidence, type EvidenceRequest } from './evidence/collectEvidence';
export { evidenceFlags, flagEffect, type OtherWork } from './evidence/flags';
export { staleAction, staleness } from './evidence/stale';
export { GitHubCiProvider, type GitHubCiOptions } from './evidence/github/GitHubCiProvider';
export { reconcile, type ReconcileEnv, type ReconcileResult } from './evidence/reconcile';
export { readSyncStatus, readTicketSync, readTicketSyncs } from './evidence/syncStore';
export {
  readAttentionPolicy,
  readAttentionPrefs,
  readAttentionState,
  updateAttentionState,
  writeAttentionPrefs,
  type AttentionPolicyRead,
} from './attention/attentionStore';
export { gatherAttention } from './attention/gatherAttention';
export {
  dropWorkspace,
  listWorkspaces,
  readWorkspace,
  readWorkspaceSettings,
  writeWorkspace,
  writeWorkspaceSettings,
  type WorkspaceSettingsRead,
} from './workspaces/workspaceStore';
export { prepareWorktree, worktreeLocation, type Prepared, type PrepareInput } from './workspaces/prepareWorktree';
export { branchChanges } from './workspaces/integration';
export { isClaimed, removeWorkspace, type RemoveWorkspaceResult } from './workspaces/removeWorkspace';
export { readIntegrationScan, writeIntegrationScan } from './workspaces/integrationStore';
export { scanIntegrations } from './workspaces/scanIntegrations';
export { attentionView } from './attention/attentionView';
export { activeRoleIds, listRoles, readRoleFiles, roleFilePath, rolesDir } from './roles/roleStore';
export { readRoleLock, roleLockPath, writeRoleLock } from './roles/roleLock';
export { checkSha, roleSha } from './roles/roleHash';
export { approveRole, installRole, lintRefusal, type Installed } from './roles/installRole';
export { approveCheck } from './roles/approveCheck';
export { removeRole } from './roles/removeRole';
export { DEFAULT_REGISTRY, isRegistryUrl, readRolesConfig } from './roles/rolesConfig';
export { fetchCatalog, fetchCatalogRole, type CatalogFetch, type Registry } from './roles/catalogClient';
export { addFromCatalog, previewCatalogRole } from './roles/addFromCatalog';
export { readChecklist, writeChecklist } from './roles/checklistStore';
