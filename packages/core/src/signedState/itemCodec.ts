import { parseMapFile, serializeMapFile } from '../adapters/markdown/mapFile';
import { parseTicket, serializeTicket } from '../adapters/markdown/ticketFile';
import type { DecisionRecord, MapDoc, Ticket } from '../model/types';
import { parseDecision, serializeDecision } from '../planning/decisions/decisionFile';
import { withDecisionFields, withMapFields, withTicketFields } from './applyFields';
import { decisionFields, mapFields, ticketFields, type Fields } from './stateFields';
import type { StateItem } from './stateItem';

type Value = Ticket | MapDoc | DecisionRecord;

/** Reads, writes and re-fields one kind of tracker file, so every caller treats the three kinds alike. */
export interface ItemCodec {
  parse(text: string): Value;
  fields(v: Value): Fields;
  apply(v: Value, f: Fields): Value;
  serialize(v: Value): string;
}

const TICKET: ItemCodec = {
  parse: (text) => parseTicket(text),
  fields: (v) => ticketFields(v as Ticket),
  apply: (v, f) => withTicketFields(v as Ticket, f),
  serialize: (v) => serializeTicket(v as Ticket),
};

const mapCodec = (mapId: string): ItemCodec => ({
  parse: (text) => parseMapFile(mapId, text),
  fields: (v) => mapFields(v as MapDoc),
  apply: (v, f) => withMapFields(v as MapDoc, f),
  serialize: (v) => serializeMapFile(v as MapDoc),
});

const decisionCodec = (mapId: string): ItemCodec => ({
  parse: (text) => ({ ...parseDecision(text), mapId }),
  fields: (v) => decisionFields(v as DecisionRecord),
  apply: (v, f) => withDecisionFields(v as DecisionRecord, f),
  serialize: (v) => serializeDecision(v as DecisionRecord),
});

export function codecOf(item: Pick<StateItem, 'kind' | 'mapId'>): ItemCodec {
  switch (item.kind) {
    case 'ticket':
      return TICKET;
    case 'map':
      return mapCodec(item.mapId);
    case 'decision':
      return decisionCodec(item.mapId);
    default: {
      const never: never = item.kind;
      throw new Error(`unknown item kind ${String(never)}`);
    }
  }
}

/** The gate fields of a file's text, or undefined when it can't be read as its kind. */
export function fieldsOfText(item: Pick<StateItem, 'kind' | 'mapId'>, text: string): Fields | undefined {
  try {
    const codec = codecOf(item);
    return codec.fields(codec.parse(text));
  } catch {
    return undefined;
  }
}
