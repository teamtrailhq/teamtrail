import type { DecisionInput, DecisionRecord, Ticket, TicketType } from '../../model/types';
import { serializeDecision } from '../../planning/decisions/decisionFile';
import { buildDecision, decisionNumber } from '../../planning/decisions/decisionRecord';
import { newTicket } from '../ticketEdits';
import type { MarkdownFs } from './markdownFs';
import { nextNumber } from './nextNumber';
import { serializeTicket } from './ticketFile';

export interface NumberedFile<T> {
  path: string;
  text: string;
  value: T;
}

/**
 * Writes a new numbered file (a ticket, a decision) under a number nobody else took. `make` names the next free
 * number each time it is asked; the file is created only if it doesn't exist, and on a collision `make` is asked
 * again. Several agent processes share the folder, and several calls in one process allocate at once, so "read
 * the highest number, write the next" alone loses records. A filesystem without exclusive create (the browser's)
 * writes as before.
 */
export async function createNumbered<T>(
  fs: MarkdownFs,
  make: () => Promise<NumberedFile<T>>,
  writing: (path: string) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const next = await make();
    writing(next.path);
    if (!fs.create) {
      await fs.write(next.path, next.text);
      return next.value;
    }
    if (await fs.create(next.path, next.text)) return next.value;
    if (attempt >= 50) throw new Error(`could not allocate ${next.path}`);
  }
}

/** The next ticket of a trail, as the file it would be. */
export async function newTicketFile(
  fs: MarkdownFs,
  mapId: string,
  input: { title: string; type: TicketType; body: string; hitl?: boolean },
): Promise<NumberedFile<Ticket>> {
  const n = await nextNumber(fs);
  const value = newTicket(String(n), `#${n}`, input);
  return { path: `${mapId}/tickets/${value.id}.md`, text: serializeTicket({ ...value, updatedAt: Date.now() }), value };
}

/** The next decision record, as the file it would be. */
export async function newDecisionFile(
  fs: MarkdownFs,
  mapId: string,
  input: DecisionInput,
): Promise<NumberedFile<DecisionRecord>> {
  const files = (await fs.list()).filter((f) => f.includes('/decisions/'));
  const n = Math.max(0, ...files.map((f) => decisionNumber(f.split('/').pop()!))) + 1;
  const value = buildDecision(`D-${n}`, mapId, input);
  return { path: `${mapId}/decisions/${value.id}.md`, text: serializeDecision(value), value };
}
