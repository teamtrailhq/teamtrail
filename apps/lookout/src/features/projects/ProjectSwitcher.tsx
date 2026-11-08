import { useEffect, useRef, useState } from 'react';
import { Badge, Label } from '../../components/ui';
import { activeProject } from '../../lib/apiBase';
import { openProject } from './projectText';
import type { ProjectsApi } from './useProjects';

/** The repo name in the header; with more than one project, a menu to switch, or to see All projects. */
export function ProjectSwitcher(props: { repo: string; projects: ProjectsApi; onOverview: () => void }) {
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
  const { view } = props.projects;
  if (!view || !props.projects.many) return <span className="repo">{props.repo}</span>;
  const current = activeProject() ?? view.home;
  const elsewhere = view.projects.filter((p) => p.id !== current).reduce((n, p) => n + p.interrupting, 0);
  return (
    <div className="project-switcher" ref={ref}>
      <button
        className="project-btn repo"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tip="Switch project, or see all of them"
      >
        <span className="project-name">{props.repo}</span>
        {elsewhere > 0 && <Badge n={elsewhere} urgent />}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="trail-menu" role="menu">
          <button
            role="menuitem"
            className="trail-item all-projects"
            onClick={() => {
              setOpen(false);
              props.onOverview();
            }}
          >
            <span className="mi-title">All projects</span>
            <Badge n={view.attention.length} urgent={view.attention.some((i) => i.interrupting)} hideZero />
          </button>
          <Label variant="plain" className="menu-h">
            Projects
          </Label>
          {view.projects.map((p) => (
            <button
              key={p.id}
              role="menuitem"
              className={`trail-item ${p.id === current ? 'on' : ''} st-${p.state.kind}`}
              disabled={p.state.kind === 'missing'}
              onClick={() => {
                setOpen(false);
                if (p.id !== current) openProject(p, view.home);
              }}
            >
              <span className="mi-title">{p.name}</span>
              <span className="mi-progress">{stateText(p.state.kind)}</span>
              <Badge n={p.needsYou} urgent={p.interrupting > 0} hideZero />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function stateText(kind: 'ok' | 'missing' | 'elsewhere'): string {
  if (kind === 'missing') return 'missing';
  if (kind === 'elsewhere') return 'other Lookout';
  return '';
}
