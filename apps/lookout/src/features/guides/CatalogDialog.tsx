import { searchCatalog } from '@teamtrail/core';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Empty, MetaLine, Panel, Select } from '../../components/ui';
import { CatalogEntry } from './CatalogEntry';
import { CatalogRow } from './CatalogRow';
import { hostOf } from './guideLabels';
import { useCatalog } from './useCatalog';
import { useGuides } from './useGuides';

/**
 * The guide catalog: search, verified only by default, and a guide's full preview before adding it. Catalogs come
 * from guides.json as approved on this machine, followed by the official one unless it opts out; each is shown with
 * the host it's read from. Teamtrail reads them over HTTPS and hosts nothing.
 */
export function CatalogDialog(props: { registries: { name: string; url: string }[]; onClose: () => void }) {
  const [registry, setRegistry] = useState(props.registries[0]?.name ?? '');
  const cat = useCatalog(registry || undefined);
  const { find } = useGuides();
  const [query, setQuery] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [openId, setOpenId] = useState<string>();
  const entries = cat.index ? searchCatalog({ v: 1, guides: cat.index.guides }, { query, verifiedOnly }) : [];
  const open = cat.index?.guides.find((e) => e.id === openId);
  const installedOf = (id: string) => (find(id)?.origin === 'local' ? find(id)?.guide?.version : undefined);
  const current = props.registries.find((r) => r.name === registry);
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
          <h3 className="t-title">Guide catalog</h3>
          {props.registries.length > 1 && (
            <Select
              compact
              aria-label="Catalog"
              value={registry}
              options={props.registries.map((r) => ({
                value: r.name,
                label: `${r.name} · ${hostOf(r.url)}`,
                hint: r.url,
              }))}
              onChange={setRegistry}
            />
          )}
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </header>
        {/* the host, not just the name: a catalog's name is whatever guides.json calls it (the picker shows both) */}
        {current && props.registries.length === 1 && (
          <MetaLine parts={[`Catalog ${current.name}`, { text: hostOf(current.url), code: true }]} />
        )}
        {open ? (
          <CatalogEntry
            entry={open}
            catalogUrl={current?.url ?? ''}
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
                placeholder="Search guides"
                aria-label="Search guides"
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
            {cat.index && !entries.length && <Empty>No guides match.</Empty>}
            <ul className="catalog-list">
              {entries.map((e) => (
                <CatalogRow
                  key={e.id}
                  entry={e}
                  catalogUrl={current?.url ?? ''}
                  installed={installedOf(e.id)}
                  onOpen={() => setOpenId(e.id)}
                />
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>,
    document.body,
  );
}
