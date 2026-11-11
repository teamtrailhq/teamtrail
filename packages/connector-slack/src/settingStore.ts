import { readFileSync } from 'node:fs';
import path from 'node:path';
import { writeLocalJson } from '@teamtrail/core/bridge';
import type { SettingCard } from './blocks/settingRequests';

/** A setting request card whose buttons are live. */
export interface PostedSetting {
  channel: string;
  ts: string;
  card: SettingCard;
}

const FILE = '.agents/slack-settings.json';

/**
 * Setting request cards Scout posted, by trail/request, in the tracker folder (`.agents/slack-settings.json`), so a
 * restart updates them instead of posting again. Stays on this machine.
 */
export function settingStore(root: string) {
  const file = path.join(root, FILE);
  return {
    read: (): Record<string, PostedSetting> => {
      try {
        return (JSON.parse(readFileSync(file, 'utf8')) as { posted?: Record<string, PostedSetting> }).posted ?? {};
      } catch {
        return {};
      }
    },
    write: (posted: Record<string, PostedSetting>) => writeLocalJson(root, FILE, { posted }),
  };
}
