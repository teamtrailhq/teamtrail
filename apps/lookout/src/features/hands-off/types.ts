import type { AttentionItem, AttentionView, SessionInfo } from '@teamtrail/core';
import type { ReactNode } from 'react';
import type { LookoutApi } from '../../hooks';
import type { AttentionHandlers } from '../attention';

/** What a row of Needs you acts with: the app's data and actions, and where things open from the home. */
export interface NeedContext {
  api: LookoutApi;
  view: AttentionView;
  sessions: SessionInfo[];
  /** Where each kind of item is handled; a ticket opens in the full-ticket drawer over the home. */
  handlers: AttentionHandlers;
  now: number;
  /** The full ticket, in its drawer over the home. */
  openTicket: (mapId: string, ticketId: string) => void;
  openChat: (sessionId: string) => void;
  dismiss: (id: string) => void;
}

/** A row's words where an item says more than its kind (the plan to approve in one step). */
export interface NeedText {
  chip: string;
  title: string;
  quick: string;
}

/** Renders one row of Needs you, open or not. */
export type NeedRowRender = (item: AttentionItem, open: boolean, toggle: () => void) => ReactNode;
