import { existsSync } from 'node:fs';
import path from 'node:path';
import { readBriefFile } from '../discovery/briefStore';
import type { MapSnapshot } from '../model/types';
import type { TrustItem } from './trustItem';
import { contentHash, trustKey, type TrustRecord } from './trustLedger';

/**
 * Trails with no discovery brief that this machine hasn't been told may skip discovery: charted without one before
 * skipping became the trail lead's call, or whose brief file went missing. Each waits for the trail lead to adopt it
 * ("this trail runs without discovery") on its own, in Settings → Approvals or `teamtrail approve`, never in a bulk
 * adoption; until then discovery gates it (discoveryGate.ts).
 */
export function discoveryItems(root: string, ledger: Record<string, TrustRecord>, snaps: MapSnapshot[]): TrustItem[] {
  return snaps.flatMap((s) => {
    const mapId = s.map.id;
    const key = trustKey.discoverySkipped(mapId);
    if (ledger[key] || readBriefFile(root, mapId)) return [];
    const content = `Skip discovery for trail ${mapId}`;
    const map = `${mapId}/map.md`;
    const line = `${s.map.title} has no discovery brief: adopting it lets agents claim implementation tickets without one.`;
    return [
      {
        key,
        kind: 'discovery' as const,
        hash: contentHash(content),
        content,
        standing: 'elsewhere' as const,
        title: `${s.map.title} runs without discovery`,
        lines: [line],
        warnings: [],
        mapId,
        ...(existsSync(path.join(root, map)) ? { file: map } : {}),
        // never adopted with others: an agent can commit a trail folder without a brief, or a brief's removal
        alone: true,
      },
    ];
  });
}
