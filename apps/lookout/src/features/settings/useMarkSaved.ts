import { useContext } from 'react';
import { SlotContext } from './slotContext';

/**
 * Marks the section this component sits in as just saved: its label line then says `Saved · journaled · 22:41`.
 * Pass `true` only where the route journals the change (the verification.json writers do, under `_trust`).
 */
export function useMarkSaved() {
  return useContext(SlotContext).mark;
}
