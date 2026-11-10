import { hasControl, OperationError } from '@teamtrail/core';
import { z } from 'zod';

/*
 * Every string a tool takes is one line unless its schema says otherwise. Titles, names, ids, keys, criteria,
 * suggestions and paths end up in places where a line break is structure (a frontmatter key, a heading, a list
 * item), so a tool call that puts a line break or another control character in one is refused before anything
 * is written. A field that really is free text (a body, a question, a resolution) is declared with `text()`.
 * The check walks the tool's own schema, so a new tool, or a new field, is line-safe without doing anything.
 */

/** Free text: may span lines. The serialisers keep it from being read back as structure. */
export const text = () => z.string().meta({ multiline: true });

type Node = z.ZodType & {
  def: { type: string; innerType?: Node; element?: Node; shape?: Record<string, Node>; options?: Node[] } & {
    keyType?: Node;
    valueType?: Node;
  };
};

const shapes = new WeakMap<object, Map<string, z.ZodRawShape>>();

/** The input schema each tool was defined with, for the server it was defined on. */
export function toolShapes(server: object) {
  let map = shapes.get(server);
  if (!map) shapes.set(server, (map = new Map()));
  return map;
}

export interface StringField {
  path: string;
  multiline: boolean;
}

const WRAPPERS = new Set(['optional', 'nullable', 'default', 'readonly', 'nonoptional', 'prefault', 'catch']);
const SCALARS = new Set(['number', 'boolean', 'enum', 'literal', 'bigint', 'date', 'null', 'undefined', 'int']);

/** Every string a schema can hold, with whether it was declared free text. `unknown` kinds are reported as such. */
export function stringFields(node: z.ZodType, path = ''): (StringField | { path: string; unknown: string })[] {
  const n = node as Node;
  const { type } = n.def;
  if (type === 'string') return [{ path, multiline: n.meta()?.multiline === true }];
  if (SCALARS.has(type)) return [];
  if (WRAPPERS.has(type) && n.def.innerType) return stringFields(n.def.innerType, path);
  if (type === 'array' && n.def.element) return stringFields(n.def.element, `${path}[]`);
  if (type === 'object' && n.def.shape)
    return Object.entries(n.def.shape).flatMap(([k, v]) => stringFields(v, path ? `${path}.${k}` : k));
  if (type === 'union' && n.def.options) return n.def.options.flatMap((o) => stringFields(o, path));
  return [{ path, unknown: type }];
}

/** Whether the value at this point of the schema may span lines: only a string declared with `text()`. */
function multilineAt(node: Node | undefined): boolean {
  if (!node) return false;
  if (node.def.type === 'string') return node.meta()?.multiline === true;
  if (WRAPPERS.has(node.def.type)) return multilineAt(node.def.innerType);
  return false;
}

/** The schema of `value`'s children, as far as the schema says; undefined means "unknown: treat as one line". */
function childOf(node: Node | undefined, value: unknown, key: string): Node | undefined {
  if (!node) return undefined;
  const { def } = node;
  if (WRAPPERS.has(def.type)) return childOf(def.innerType, value, key);
  if (def.type === 'array') return def.element;
  if (def.type === 'object') return def.shape?.[key];
  // Of a union's shapes, the one this value actually is; when it is none of them, unknown.
  if (def.type === 'union')
    return childOf(
      def.options?.find((o) => o.safeParse(value).success),
      value,
      key,
    );
  return undefined;
}

const REFUSAL = 'must be a single line: it holds a line break or another control character';

/** Refuses a call in which a single-line input holds a line break or control character. Unknown inputs count as single-line. */
export function assertLineSafe(tool: string, shape: z.ZodRawShape, args: unknown) {
  const walk = (value: unknown, node: Node | undefined, path: string) => {
    if (typeof value === 'string') {
      if (hasControl(value) && !multilineAt(node)) throw new OperationError(`${tool}: \`${path}\` ${REFUSAL}.`);
      return;
    }
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, childOf(node, value, String(i)), `${path}[${i}]`));
    if (!value || typeof value !== 'object') return;
    for (const [k, v] of Object.entries(value)) {
      if (hasControl(k)) throw new OperationError(`${tool}: a key of \`${path || 'the input'}\` ${REFUSAL}.`);
      walk(v, childOf(node, value, k), path ? `${path}.${k}` : k);
    }
  };
  walk(args, z.object(shape) as unknown as Node, '');
}
