import type { AnsweredQuestion, MapDoc, MapMode, MapSnapshot, ModelMatching } from '@teamtrail/core';
import type { Prefs, TrackerChoice } from '../../lib';

/** The groups of the Settings page, in side-nav order. */
export type SettingsGroupId = 'trail' | 'project' | 'alerts' | 'you' | 'projects' | 'about';

/** One section inside a group; `?settings=<section>` opens its group scrolled to it. */
export type SettingsSectionId =
  | 'mode'
  | 'verification'
  | 'models'
  | 'team'
  | 'tracker'
  | 'workspaces'
  | 'policy'
  | 'guides'
  | 'labels'
  | 'attention'
  | 'slack'
  | 'trip-report'
  | 'appearance'
  | 'transcript'
  | 'agent'
  | 'projects'
  | 'changelog';

/** Where a section's setting lives: committed with the repo, in this machine's config, or in this browser. */
export type SettingsStorage = 'repo' | 'machine' | 'browser';

export interface SettingsGroup {
  id: SettingsGroupId;
  label: string;
  /** The short intro line under the group heading. */
  intro: string;
  sections: { id: SettingsSectionId; title: string }[];
}

/**
 * Settings while open, as the URL says it: the group shown (none yet on a phone, which lists the groups first)
 * and the section a deep link asked for.
 */
export interface SettingsRoute {
  group?: SettingsGroupId;
  section?: SettingsSectionId;
}

/** What the sections need from the app: preferences, the tracker, the trail on screen and its actions. */
export interface SettingsData {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  activeTracker: TrackerChoice;
  location: string;
  map?: MapDoc;
  onMapMode: (m: MapMode) => void;
  /** Every trail and the answered questions, for the delivery hints next to model tiers. */
  snaps: MapSnapshot[];
  answered: AnsweredQuestion[];
  onModelMatching: (value: ModelMatching) => void;
}
