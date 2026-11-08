import { searchCatalog } from '@teamtrail/core';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Empty, Panel, Select } from '../../components/ui';
import { CatalogEntry } from './CatalogEntry';
import { CatalogRow } from './CatalogRow';
import { useCatalog } from './useCatalog';
import { useRoles } from './useRoles';

/**
 * The role catalog: search, verified only by default, and a role's full preview before adding it. Catalogs come
 * from roles.json (the official one by default); Teamtrail reads them over HTTPS and hosts nothing.
 */
export function CatalogDialog(props: { registries: { name: string; url: string }[]; onClose: () => void }) {
  const [registry, setRegistry] = useState(props.registries[0]?.name ?? '');
  const cat = useCatalog(registry || undefined);
  const { find } = useRoles();
  const [query, setQuery] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [openId, setOpenId] = useState<string>();
  const entries = cat.index ? searchCatalog({ v: 1, roles: cat.index.roles }, { query, verifiedOnly }) : [];
  const open = cat.index?.roles.find((e) => e.id === openId);
  const installedOf = (id: string) => (find(id)?.origin === 'local' ? find(id)?.role?.version : undefined);
  return createPortal(
    <div
      className="scrim catalog-scrim"
      onClick={(e) => {
        e.stopPropagation();
        props.onClose();
      }}
    >
      <Panel as="div" className="dialog catalog-dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3 className="t-title">Role catalog</h3>
          {props.registries.length > 1 && (
            <Select
              compact
              aria-label="Catalog"
              value={registry}
              options={props.registries.map((r) => ({ value: r.name, label: r.name, hint: r.url }))}
              onChange={setRegistry}
            />
          )}
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </header>
        {open ? (
          <CatalogEntry
            entry={open}
            installed={installedOf(open.id)}
            preview={cat.preview}
            add={cat.add}
            onBack={() => setOpenId(undefined)}
          />
        ) : (
          <>
            <div className="catalog-filters">
              <input
                className="catalog-search"
                placeholder="Search roles"
                aria-label="Search roles"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button
                size="sm"
                on={verifiedOnly}
                aria-pressed={verifiedOnly}
                onClick={() => setVerifiedOnly((v) => !v)}
              >
                Verified only
              </Button>
            </div>
            {cat.error && <span className="vf-err">{cat.error}</span>}
            {!cat.index && !cat.error && <Empty>Reading the catalog…</Empty>}
            {cat.index && !entries.length && <Empty>No roles match.</Empty>}
            <ul className="catalog-list">
              {entries.map((e) => (
                <CatalogRow key={e.id} entry={e} installed={installedOf(e.id)} onOpen={() => setOpenId(e.id)} />
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>,
    document.body,
  );
}
