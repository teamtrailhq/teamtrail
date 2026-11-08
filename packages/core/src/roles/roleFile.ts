import { ROLE_LIMITS, type RoleDoc, type RoleFinding } from '../model/role';
import { roleFields } from './roleSchema';
import { parseYamlSubset } from './roleYaml';

/** The two parts of a role file and the file line its body starts on. */
export function splitRoleFile(text: string): { front: string; body: string; bodyLine: number } | undefined {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---[ \t]*\n?([\s\S]*)$/);
  if (!m) return undefined;
  return { front: m[1], body: m[2], bodyLine: m[1].split('\n').length + 3 };
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/**
 * Parses `roles/<id>.md`: YAML frontmatter with the role's fields, and the markdown body as its instructions.
 * `role` is only set when there are no schema errors; every finding names its line.
 */
export function parseRole(text: string): { role?: RoleDoc; findings: RoleFinding[] } {
  const parts = splitRoleFile(text);
  if (!parts)
    return {
      findings: [{ line: 1, rule: 'schema', level: 'error', message: 'a role file starts with --- frontmatter' }],
    };
  const yaml = parseYamlSubset(parts.front, 2);
  const yamlFindings: RoleFinding[] = yaml.errors.map((e) => ({ ...e, rule: 'schema', level: 'error' }));
  const { fields, findings } = roleFields(yaml);
  const instructions = parts.body.trim();
  const body: RoleFinding[] = [];
  if (!instructions)
    body.push({ line: parts.bodyLine, rule: 'schema', level: 'error', message: 'the body holds the instructions' });
  if (byteLength(instructions) > ROLE_LIMITS.bodyBytes)
    body.push({
      line: parts.bodyLine,
      rule: 'size',
      level: 'error',
      message: `the instructions are ${byteLength(instructions)} bytes; at most ${ROLE_LIMITS.bodyBytes}`,
    });
  const all = [...yamlFindings, ...findings, ...body];
  if (!fields || all.length) return { findings: all };
  return { role: { ...fields, instructions }, findings: [] };
}
