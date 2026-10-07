import { describe, expect, it } from 'vitest';
import { conversationUnread, firstNameOf, replyStarter, splitQuotedText, threadKeyOf } from '../types';

describe('firstNameOf', () => {
  it('takes the first name from the forms senders arrive in', () => {
    expect(firstNameOf('Jane Doe')).toBe('Jane');
    expect(firstNameOf('  Doe, Jane ')).toBe('Jane');
    expect(firstNameOf('jane.doe@gmail.com')).toBe('Jane');
    expect(firstNameOf("O'Brien Family Trust")).toBe("O'Brien");
  });
  it('gives nothing usable rather than a greeting to a number or an initial', () => {
    expect(firstNameOf('ashleylw5252@yahoo.com')).toBeNull();
    expect(firstNameOf('J')).toBeNull();
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe('replyStarter', () => {
  it('greets by first name and signs, with the caret between', () => {
    const { body, caretAt } = replyStarter('Jane Doe');
    expect(body).toBe('Hi Jane,\n\n\n\nWarm regards,\nThe Mayells Team');
    expect(body.slice(0, caretAt)).toBe('Hi Jane,\n\n');
  });
  it('falls back to a plain greeting', () => {
    expect(replyStarter('ashleylw5252@yahoo.com').body.startsWith('Hello,\n\n')).toBe(true);
  });
});

describe('splitQuotedText', () => {
  it('folds the quoted history under "On … wrote:"', () => {
    const text = 'Thanks, Tuesday works.\n\nOn Oct 1, 2026, Mayells <info@mayells.com> wrote:\n> Would Tuesday suit?\n> Best';
    expect(splitQuotedText(text)).toEqual({ own: 'Thanks, Tuesday works.', quoted: 'On Oct 1, 2026, Mayells <info@mayells.com> wrote:\n> Would Tuesday suit?\n> Best' });
  });
  it('folds at the first ">" line when there is no attribution', () => {
    expect(splitQuotedText('Yes please.\n> Shall we?')).toEqual({ own: 'Yes please.', quoted: '> Shall we?' });
  });
  it('leaves a message that is only a quote, or has no quote, alone', () => {
    expect(splitQuotedText('> forwarded\n> text')).toEqual({ own: '> forwarded\n> text', quoted: null });
    expect(splitQuotedText('Hello there\nNo quote here')).toEqual({ own: 'Hello there\nNo quote here', quoted: null });
  });
});

describe('conversation helpers', () => {
  it('keys a row by its thread, falling back to its own id', () => {
    expect(threadKeyOf({ id: 'a', threadId: null })).toBe('a');
    expect(threadKeyOf({ id: 'a', threadId: 't' })).toBe('t');
  });
  it('marks a row unread while any message in its conversation is', () => {
    expect(conversationUnread({ threadUnread: 0 })).toBe(false);
    expect(conversationUnread({ threadUnread: 2 })).toBe(true);
  });
});
