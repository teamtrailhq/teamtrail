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
