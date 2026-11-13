import type { MapSnapshot, MapDoc, ActivityState } from '@teamtrail/core';
import { useState, useRef, useEffect } from 'react';
import { Badge, Label } from '../../components/ui';
import { TrailActions } from './TrailActions';
import { TrailItem } from './TrailItem';

export function TrailSwitcher(props: {
  snaps: Record<string, MapSnapshot>;
  map?: MapDoc;
  activity: ActivityState;
  onSelectMap: (id: string) => void;
  onNewTrail: () => void;
  onStartOver?: () => void;
  onArchive?: (archived: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  const all = Object.values(props.snaps).sort((a, b) => b.map.createdAt - a.map.createdAt);
  const trails = all.filter((s) => !s.map.archived);
  const archived = all.filter((s) => s.map.archived);
  const waitingIn = (id: string) => props.activity.pending.filter((q) => q.mapId === id).length;
  const otherWaiting = props.activity.pending.filter((q) => q.mapId !== props.map?.id).length;
  const item = (s: MapSnapshot) => (
    <TrailItem
      key={s.map.id}
      snap={s}
      on={s.map.id === props.map?.id}
      waiting={waitingIn(s.map.id)}
      onSelect={() => {
        props.onSelectMap(s.map.id);
        setOpen(false);
      }}
    />
  );
  return (
    <div className="trail-switcher" ref={ref}>
      <button
        className="trail-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tip="Switch trail, or start a new one"
      >
        <span className="trail-title">{props.map ? `${props.map.key} ${props.map.title}` : 'No trail'}</span>
        {props.map?.archived && <span className="trail-archived">archived</span>}
        {otherWaiting > 0 && <Badge n={otherWaiting} urgent />}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="trail-menu" role="menu">
          <Label variant="plain" className="menu-h">
            Trails
          </Label>
          {trails.map(item)}
          <button
            role="menuitem"
            className="trail-item new"
            onClick={() => {
              setOpen(false);
              props.onNewTrail();
            }}
          >
            + New trail
          </button>
          {archived.length > 0 && (
            <>
              <Label variant="plain" className="menu-h">
                Archived
              </Label>
              {archived.map(item)}
            </>
          )}
          {props.map && props.onStartOver && props.onArchive && (
            <div className="trail-acts">
              <TrailActions
                map={props.map}
                onStartOver={props.onStartOver}
                onArchive={props.onArchive}
                onDone={() => setOpen(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
