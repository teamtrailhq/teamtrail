import type { CatalogEntry, InstalledRole, RoleDoc, RoleFinding } from '@teamtrail/core';

/** GET /roles: every role with its status, and the catalogs from roles.json. */
export interface RolesView {
  roles: InstalledRole[];
  registries: { name: string; url: string }[];
  configErrors: string[];
}

/** GET /roles/catalog: one catalog's index. */
export interface CatalogView {
  registry: { name: string; url: string };
  repo?: string;
  roles: CatalogEntry[];
}

/** GET /roles/catalog/preview: one catalog role, fetched and linted, nothing written yet. */
export interface CatalogPreview {
  registry: { name: string; url: string };
  entry: CatalogEntry;
  text: string;
  repo?: string;
  role?: RoleDoc;
  findings: RoleFinding[];
  ok: boolean;
}

/** POST /roles/catalog/add. */
export interface AddResult extends RolesView {
  installed: { id: string; version: string; pendingChecks: string[] };
}
