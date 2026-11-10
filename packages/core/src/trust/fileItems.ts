import { CRITERIA_DIR } from '../criteria/criteria';
import { criteriaContent, criteriaIds, readCriteriaFile } from '../criteria/criteriaStore';
import { BRIEF_DIR } from '../discovery/brief';
import { briefIds, readBriefFile } from '../discovery/briefStore';
import { isLive, KNOWLEDGE_DIR } from '../knowledge/knowledge';
import { knowledgeContent, listKnowledgeFiles } from '../knowledge/knowledgeStore';
import { judged } from './judged';
import { firstLines } from './lineDiff';
import type { TrustItem } from './trustItem';
import { trustKey, type TrustRecord } from './trustLedger';

type Ledger = Record<string, TrustRecord>;

/** Briefs whose file says accepted, not as approved here. */
export function briefItems(root: string, ledger: Ledger): TrustItem[] {
  return briefIds(root).flatMap((mapId) => {
    const read = readBriefFile(root, mapId);
    if (!read || read.brief.status !== 'accepted') return [];
    const j = judged(ledger, trustKey.brief(mapId), read.text);
    if (!j) return [];
    const lines = j.standing === 'changed' ? j.lines : firstLines(read.brief.sections.summary || read.text);
    const file = `${BRIEF_DIR}/${mapId}.md`;
    return [{ ...j, lines, kind: 'brief' as const, title: 'Accepted discovery brief', mapId, file }];
  });
}

/** Criteria whose file says confirmed, not as confirmed here. */
export function criteriaItems(root: string, ledger: Ledger): TrustItem[] {
  return criteriaIds(root).flatMap((mapId) =>
    readCriteriaFile(root, mapId)
      .filter((t) => t.confirmed)
      .flatMap((t) => {
        const j = judged(ledger, trustKey.criteria(mapId, t.ticketId), criteriaContent(t));
        if (!j) return [];
        const title = `Confirmed criteria of ${t.ticketKey}`;
        const file = `${CRITERIA_DIR}/${mapId}.md`;
        return [{ ...j, kind: 'criteria' as const, title, mapId, ticketId: t.ticketId, file }];
      }),
  );
}

/** Knowledge whose file says confirmed or assumption, not as approved here. */
export function knowledgeItems(root: string, ledger: Ledger): TrustItem[] {
  return listKnowledgeFiles(root)
    .filter(isLive)
    .flatMap((e) => {
      const j = judged(ledger, trustKey.knowledge(e.id), knowledgeContent(e));
      if (!j) return [];
      const title = `${e.status === 'confirmed' ? 'Confirmed knowledge' : 'Accepted assumption'} ${e.id}: ${e.title}`;
      return [{ ...j, kind: 'knowledge' as const, title, file: `${KNOWLEDGE_DIR}/${e.id}.md` }];
    });
}
