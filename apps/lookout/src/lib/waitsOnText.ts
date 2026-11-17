/**
 * What a ticket that hasn't started waits on, as short as a card chip: "waits on #22, #8", "waits on your #6" (one of
 * them waits on you), "waits on 3 tickets"; nothing when it waits on no open ticket.
 */
export function waitsOnText(waitsOn: string[], yours: string[]) {
  if (!waitsOn.length) return undefined;
  if (waitsOn.length > 2) return `waits on ${waitsOn.length} tickets`;
  const keys = waitsOn.map((k) => (yours.includes(k) ? `your ${k}` : k));
  return `waits on ${keys.join(', ')}`;
}
