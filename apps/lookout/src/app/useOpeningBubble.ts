import type { ActivityState, AttentionItem, AttentionView } from '@teamtrail/core';
import { useEffect, useRef } from 'react';
import { ITEM_PARAM } from '../lib/apiBase';
import { onFirstInput } from '../lib/onFirstInput';

/** Kinds whose place is a bubble on the map: a ticket's, a question's, checks on main, or checks together. */
const BUBBLE_KINDS = new Set<AttentionItem['kind']>(['question', 'main-checks', 'trail-checks']);
const hasBubble = (i: AttentionItem) => !!i.ticketId || BUBBLE_KINDS.has(i.kind);

/**
 * When the Lookout opens on the map and something on the trail needs you, the most urgent of it opens in its
 * bubble, once. Not when a link names what to open (`?item=`), a page covers the map, or something is selected, and
 * never after the person has clicked or typed: what they opened while the page was still loading (Trail stats from
 * Records) stays on screen. The first press is heard before the page handles it, so an opening still on its way
 * when they click can't cover what the click opens.
 */
export function useOpeningBubble(input: {
  loaded: boolean;
  view?: AttentionView;
  activity: ActivityState;
  mapId?: string;
  busy: boolean;
  open: (item: AttentionItem) => void;
}) {
  const done = useRef(new URLSearchParams(location.search).has(ITEM_PARAM));
  const { loaded, view, activity, mapId, busy, open } = input;
  useEffect(() => onFirstInput(window, () => (done.current = true)), []);
  useEffect(() => {
    if (done.current || !loaded || !view || !mapId) return;
    const top = view.items.find((i) => i.mapId === mapId && hasBubble(i));
    // a question opens once its conversation is known
    if (top?.kind === 'question' && !activity.pending.some((q) => q.id === top.ref)) return;
    done.current = true;
    if (top && !busy) open(top);
  }, [loaded, view, activity, mapId, busy, open]);
}
