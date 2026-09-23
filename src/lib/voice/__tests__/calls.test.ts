import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/lib/ai/client', () => ({ getModel: () => null }));

import { cleanTranscript } from '../calls';

describe('cleanTranscript', () => {
  it('keeps caller and agent turns and trims text', () => {
    expect(
      cleanTranscript([
        { role: 'caller', text: '  I have a Rolex  ' },
        { role: 'agent', text: 'Tell me more.' },
      ]),
    ).toEqual([
      { role: 'caller', text: 'I have a Rolex' },
      { role: 'agent', text: 'Tell me more.' },
    ]);
  });

  it('treats unknown roles as the caller and drops empty or malformed turns', () => {
    expect(
      cleanTranscript([{ role: 'system', text: 'hi' }, { role: 'agent', text: '   ' }, null, 'x', { role: 'agent' }]),
    ).toEqual([{ role: 'caller', text: 'hi' }]);
  });

  it('caps turn length and count', () => {
    const long = cleanTranscript([{ role: 'caller', text: 'a'.repeat(5000) }]);
    expect(long[0].text).toHaveLength(2000);
    const many = cleanTranscript(Array.from({ length: 1000 }, () => ({ role: 'agent', text: 'ok' })));
    expect(many).toHaveLength(400);
  });

  it('returns nothing for a non-array', () => {
    expect(cleanTranscript({ role: 'caller', text: 'hi' })).toEqual([]);
  });
});
