import type { KnowledgeCall, KnowledgeEntry, KnowledgeKind } from '@teamtrail/core';
import { createContext, useContext } from 'react';

export interface KnowledgeDraft {
  title: string;
  body: string;
  kind: KnowledgeKind;
  sources: string[];
  scope?: string[];
  tags?: string[];
  anchors?: string[];
}

export interface KnowledgeStore {
  entries: KnowledgeEntry[];
  /** Per entry id: anchored files changed since it was confirmed. */
  stale: Record<string, string[]>;
  /** Text from the current trail's discovery brief, for path matching in previews. */
  briefText: string;
  /** Entries that need the trail lead: suggestions, flags and stale confirmations. */
  attention: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Per entry, the hash of its content as the server has it now (an approval sends the one the human opened). */
  hashes: Record<string, string>;
  /** `shown`: the hash of the entry as the trail lead opened it, sent with confirm and keep-as-assumption. */
  call: (id: string, call: KnowledgeCall, shown?: string) => Promise<boolean>;
  propose: (draft: KnowledgeDraft) => Promise<KnowledgeEntry | undefined>;
  error?: string;
}

export const KnowledgeContext = createContext<KnowledgeStore | null>(null);

export function useKnowledge() {
  const k = useContext(KnowledgeContext);
  if (!k) throw new Error('useKnowledge needs a KnowledgeContext provider');
  return k;
}
