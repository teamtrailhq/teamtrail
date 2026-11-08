import { trackerSettingsApi } from '@teamtrail/core';
import type { Prefs, TrackerChoice } from '../../lib';
import { apiBase } from '../../lib/apiBase';

export const trackerApi = trackerSettingsApi(apiBase());

export function switchTracker(update: (p: Partial<Prefs>) => void, tracker: TrackerChoice) {
  update({ tracker });
  const url = new URL(location.href);
  url.searchParams.delete('tracker');
  location.href = url.toString();
}
