import type { CatalogEntry, InstalledGuide, GuideDoc, GuideFinding } from '@teamtrail/core';

/** GET /guides: every guide with its status, and the catalogs from guides.json. */
export interface GuidesView {
  guides: InstalledGuide[];
  registries: { name: string; url: string }[];
  configErrors: string[];
}

/** GET /guides/catalog: one catalog's index. */
export interface CatalogView {
  registry: { name: string; url: string };
  repo?: string;
  guides: CatalogEntry[];
}

/** GET /guides/catalog/preview: one catalog guide, fetched and linted, nothing written yet. */
export interface CatalogPreview {
  registry: { name: string; url: string };
  entry: CatalogEntry;
  text: string;
  repo?: string;
  guide?: GuideDoc;
  findings: GuideFinding[];
  ok: boolean;
}

/** POST /guides/catalog/add. */
export interface AddResult extends GuidesView {
  installed: { id: string; version: string; pendingChecks: string[] };
}

/** A ticket's guide as its map card shows it (useSignGuide). */
export interface SignGuide {
  id: string;
  name: string;
  /** The full name and version, or why agents can't use it. */
  tip: string;
  /** Agents can't use it now (not approved, changed, invalid, missing). */
  off: boolean;
}
