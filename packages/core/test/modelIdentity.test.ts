import { describe, expect, it } from 'vitest';
import { modelIdentity } from '../src/planning/matching/modelIdentity';
import { sameModel } from '../src/planning/matching/sameModel';

describe('modelIdentity', () => {
  it('drops dates, routing prefixes, deployment versions and context tags', () => {
    for (const id of [
      'claude-opus-5-5',
      'Claude-Opus-5-5',
      'claude-opus-5-5-20261001',
      'claude-opus-5-5@20261001',
      'claude-opus-5-5[1m]',
      'anthropic/claude-opus-5-5',
      'us.anthropic.claude-opus-5-5-20261001-v1:0',
      'claude-opus-5-5-latest',
    ])
      expect(modelIdentity(id), id).toEqual({ id: 'claude-opus-5-5', vendor: 'anthropic' });
  });

  it('keeps versions and names the vendor', () => {
    expect(modelIdentity('gpt-5.1-codex-2026-02-01')).toEqual({ id: 'gpt-5.1-codex', vendor: 'openai' });
    expect(modelIdentity('o3')).toEqual({ id: 'o3', vendor: 'openai' });
    expect(modelIdentity('gemini-3-pro')?.vendor).toBe('google');
    expect(modelIdentity('acme-coder-2')).toEqual({ id: 'acme-coder-2', vendor: 'acme' });
    expect(modelIdentity('  ')).toBeUndefined();
    expect(modelIdentity(undefined)).toBeUndefined();
  });

  it('is the same model only for the same normalised id', () => {
    expect(sameModel('claude-opus-5-5', 'claude-opus-5-5-20261001')).toBe('claude-opus-5-5');
    expect(sameModel('claude-opus-5-5', 'claude-sonnet-5-5')).toBeUndefined();
    expect(sameModel('claude-opus-4-5', 'claude-opus-4-6')).toBeUndefined();
    expect(sameModel('claude-opus-5-5', undefined)).toBeUndefined();
    expect(sameModel(undefined, undefined)).toBeUndefined();
  });
});
