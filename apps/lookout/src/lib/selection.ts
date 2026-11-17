/**
 * What is open on the map: a ticket (its bubble, and the full ticket on request), checks on main, a question an agent
 * asked about the trail as a whole, or an item from the trail's "not yet specified" list (on the Plan page).
 */
export type Selection =
  | { kind: 'ticket'; id: string }
  | { kind: 'main' }
  | { kind: 'question'; id: string }
  | { kind: 'unspecified'; item: string }
  | null;
