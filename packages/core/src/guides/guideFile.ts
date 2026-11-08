import { GUIDE_LIMITS, type GuideDoc, type GuideFinding } from '../model/guide';
import { guideFields } from './guideSchema';
import { parseYamlSubset } from './guideYaml';

/** The two parts of a guide file and the file line its body starts on. */
export function splitGuideFile(text: string): { front: string; body: string; bodyLine: number } | undefined {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---[ \t]*\n?([\s\S]*)$/);
  if (!m) return undefined;
  return { front: m[1], body: m[2], bodyLine: m[1].split('\n').length + 3 };
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/**
 * Parses `guides/<id>.md`: YAML frontmatter with the guide's fields, and the markdown body as its instructions.
 * `guide` is only set when there are no schema errors; every finding names its line.
 */
export function parseGuide(text: string): { guide?: GuideDoc; findings: GuideFinding[] } {
  const parts = splitGuideFile(text);
  if (!parts)
    return {
      findings: [{ line: 1, rule: 'schema', level: 'error', message: 'a guide file starts with --- frontmatter' }],
    };
  const yaml = parseYamlSubset(parts.front, 2);
  const yamlFindings: GuideFinding[] = yaml.errors.map((e) => ({ ...e, rule: 'schema', level: 'error' }));
  const { fields, findings } = guideFields(yaml);
  const instructions = parts.body.trim();
  const body: GuideFinding[] = [];
  if (!instructions)
    body.push({ line: parts.bodyLine, rule: 'schema', level: 'error', message: 'the body holds the instructions' });
  if (byteLength(instructions) > GUIDE_LIMITS.bodyBytes)
    body.push({
      line: parts.bodyLine,
      rule: 'size',
      level: 'error',
      message: `the instructions are ${byteLength(instructions)} bytes; at most ${GUIDE_LIMITS.bodyBytes}`,
    });
  const all = [...yamlFindings, ...findings, ...body];
  if (!fields || all.length) return { findings: all };
  return { guide: { ...fields, instructions }, findings: [] };
}
