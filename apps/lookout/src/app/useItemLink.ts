import { type ActivityState, type AttentionItem, type AttentionView } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { type AttentionHandlers, openItem } from '../features/attention';
import { ITEM_PARAM } from '../lib/apiBase';

function dropParam() {
  const url = new URL(location.href);
  if (!url.searchParams.has(ITEM_PARAM)) return;
  url.searchParams.delete(ITEM_PARAM);
  history.replaceState(history.state, '', url);
}

/** Ready once the queue is loaded, and for a question once its conversation is known too. */
function readyFor(item: AttentionItem, activity: ActivityState) {
  return item.kind !== 'question' || activity.pending.some((q) => q.id === item.ref);
}

/**
 * Deep links to a queue item (`?item=<attention item id>`, set by All projects): once this project's queue has
 * loaded, the item opens exactly as its row in Needs you would open it: a ticket, a question or checks on main in
 * its bubble, a reroute in its review, a brief in the brief. `request` does the same without a reload.
 */
export function useItemLink(input: {
  loaded: boolean;
  view?: AttentionView;
  activity: ActivityState;
  handlers: AttentionHandlers;
}) {
  const [pending, setPending] = useState(() => new URLSearchParams(location.search).get(ITEM_PARAM) ?? undefined);
  const { loaded, view, activity, handlers } = input;
  useEffect(() => {
    if (!pending || !loaded || !view) return;
    const item = view.items.find((i) => i.id === pending);
    if (item && !readyFor(item, activity)) return;
    setPending(undefined);
    dropParam();
    if (!item) return;
    openItem(item, handlers);
  }, [pending, loaded, view, activity, handlers]);
  return { request: useCallback((id: string) => setPending(id), []) };
}
