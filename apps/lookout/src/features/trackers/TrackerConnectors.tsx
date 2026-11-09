import { type RemoteKind, CONNECTORS } from '@teamtrail/core';
import { useState, useMemo } from 'react';
import type { TrackerChoice, Prefs } from '../../lib';
import { ConnectorCard } from './ConnectorCard';
import { GitHubSetup } from './GitHubSetup';
import { isRemote } from './labels';
import { LinearSetup } from './LinearSetup';
import { trackerApi, switchTracker } from './trackerApi';
import { useTrackerSettings } from './useTrackerSettings';

/** The Tracker section of Settings: one card per connector, with inline setup for GitHub and Linear. */
export function TrackerConnectors(props: {
  activeTracker: TrackerChoice;
  location: string;
  update: (p: Partial<Prefs>) => void;
}) {
  const [s, , reload] = useTrackerSettings(5000);
  const [open, setOpen] = useState<RemoteKind | null>(null);
  const select = async (id: TrackerChoice) => {
    if (s && (id === 'markdown' || isRemote(id)))
      await trackerApi
        .connect({
          active: id === 'markdown' ? 'markdown' : id,
          ...(id === 'github' && s.github.repo ? { github: { repo: s.github.repo } } : {}),
          ...(id === 'linear' && s.linear.teamId
            ? {
                linear: {
                  teamId: s.linear.teamId,
                  teamKey: s.linear.teamKey,
                  teamName: s.linear.teamName,
                  projectId: s.linear.projectId,
                  projectName: s.linear.projectName,
                },
              }
            : {}),
        })
        .catch(() => {});
    switchTracker(props.update, id);
  };
  const configured = useMemo(() => ({ github: !!s?.github.repo, linear: !!s?.linear.teamId }), [s]);
  return (
    <>
      <div className="connectors">
        {CONNECTORS.map((c) => {
          const id = c.id as TrackerChoice;
          return (
            <ConnectorCard
              key={c.id}
              id={id}
              name={c.name}
              active={id === props.activeTracker}
              configured={isRemote(id) && configured[id]}
              open={open === id}
              location={props.location}
              s={s}
              onSwitch={() => void select(id)}
              onToggle={() => isRemote(id) && setOpen(open === id ? null : id)}
            />
          );
        })}
      </div>
      {s && open === 'github' && (
        <GitHubSetup s={s} reload={reload} onConnected={() => switchTracker(props.update, 'github')} />
      )}
      {s && open === 'linear' && <LinearSetup s={s} onConnected={() => switchTracker(props.update, 'linear')} />}
    </>
  );
}
