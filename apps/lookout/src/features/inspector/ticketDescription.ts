/**
 * A ticket's body as the Description section shows it: without the "Part of trail #12." line charting adds for
 * people reading the ticket in the tracker. Here the trail is already on screen.
 */
export function ticketDescription(body: string) {
  return body.replace(/\s*Part of trail \S+\.\s*$/, '').trim();
}
