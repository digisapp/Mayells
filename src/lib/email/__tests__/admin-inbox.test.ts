import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));
vi.mock('../resend', () => ({ getResend: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { quotedHtml, quotedText } from '../admin-inbox';

const base = { createdAt: new Date('2026-10-01T15:00:00Z'), fromName: 'Jane', fromEmail: 'jane@gmail.com' };

describe('quoting the message a reply answers', () => {
  it('quotes the text part when there is one', () => {
    const text = quotedText({ ...base, bodyText: 'Line one\nLine two', bodyHtml: '<p>ignored</p>' });
    expect(text).toContain('Jane wrote:');
    expect(text).toContain('> Line one\n> Line two');
  });

  it('quotes an HTML-only message as text, in the plain part as in the HTML part', () => {
    const original = { ...base, bodyText: null, bodyHtml: '<p>Hello <b>there</b></p><p>Second</p>' };
    expect(quotedText(original)).toContain('> Hello there\n> Second');
    expect(quotedHtml(original)).toContain('Hello there');
  });

  it('quotes nothing when the message has no body', () => {
    expect(quotedText({ ...base, bodyText: null, bodyHtml: null })).toBe('');
  });
});
