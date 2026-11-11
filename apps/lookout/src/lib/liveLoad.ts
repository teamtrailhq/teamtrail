import { newestWins } from './newestWins';
import { onServerEvent, onStreamOpen, onTrackerChange } from './trackerChanges';

/** One view the server keeps changing: how to load it, how to show it, and what says it changed. */
export interface LiveLoadSpec<T> {
  /** Fetches the view as it is now. */
  load: () => Promise<T>;
  /** Shows a load's result. */
  show: (value: T) => void;
  /** The load failed. */
  failed?: () => void;
  /** A tracker file changed: true when it is one this view shows. */
  changed?: (path: string) => boolean;
  /** Named server events that mean the view changed; each filter gets the parsed data and says whether it's this view's. */
  events?: Record<string, (data: unknown) => boolean>;
}

export interface LiveLoader {
  /** Loads again; a load that lands after a newer one was shown is dropped. */
  reload: () => void;
  /** The server answered with the view as it is now (an action's reply, an event with the data): older loads are dropped. */
  pushed: () => void;
  /** Unsubscribes; loads still on their way are dropped. */
  stop: () => void;
}

const parsed = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

/**
 * Keeps a view live on the shared event stream: loads it now, again when one of its files or events says it
 * changed, and again each time the stream opens, since nothing is sent while it is down (before it first opens, or
 * while it reconnects). Overlapping loads land in the order they started (newestWins), so a slow load never
 * replaces a newer view.
 */
export function liveLoad<T>(spec: LiveLoadSpec<T>): LiveLoader {
  const order = newestWins();
  let stopped = false;
  const reload = () => {
    const fresh = order.start();
    spec.load().then(
      (value) => !stopped && fresh() && spec.show(value),
      () => !stopped && fresh() && spec.failed?.(),
    );
  };
  const { changed, events = {} } = spec;
  const offs = [
    onStreamOpen(reload),
    ...(changed ? [onTrackerChange((path) => changed(path) && reload())] : []),
    ...Object.entries(events).map(([name, mine]) => onServerEvent(name, (raw) => mine(parsed(raw)) && reload())),
  ];
  reload();
  return {
    reload,
    pushed: () => order.pushed(),
    stop: () => {
      stopped = true;
      for (const off of offs) off();
    },
  };
}
