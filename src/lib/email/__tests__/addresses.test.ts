import { afterEach, describe, it, expect } from 'vitest';
import {
  bareAddress,
  decodeEncodedWords,
  getAdminFrom,
  getAdminFromAddress,
  getInboundAddress,
  getInboundDomain,
  isOwnAddress,
  isValidEmail,
  ownRecipient,
  parseEmailAddress,
  parseThreadIdFromAddresses,
  recipientsOf,
  senderDisplayName,
  stripPlusTag,
  threadReplyAddress,
} from '../addresses';

const THREAD = '0b4a1f7e-3c2d-4e5f-8a9b-0c1d2e3f4a5b';

afterEach(() => {
  delete process.env.ADMIN_EMAIL_ADDRESS;
  delete process.env.ADMIN_EMAIL_FROM;
});

describe('bareAddress', () => {
  it('extracts the address from a display-name form', () => {
    expect(bareAddress('Jane Doe <jane@example.com>')).toBe('jane@example.com');
    expect(bareAddress('"Doe, Jane" <jane@example.com>')).toBe('jane@example.com');
  });

  it('passes a bare address through, trimmed', () => {
    expect(bareAddress('  jane@example.com ')).toBe('jane@example.com');
  });
});

describe('parseEmailAddress', () => {
  it('splits name and lowercased address in every common form', () => {
    expect(parseEmailAddress('Jane Doe <Jane@Example.com>')).toEqual({ name: 'Jane Doe', email: 'jane@example.com' });
    expect(parseEmailAddress('"Doe, Jane" <jane@example.com>')).toEqual({ name: 'Doe, Jane', email: 'jane@example.com' });
    expect(parseEmailAddress('<jane@example.com>')).toEqual({ name: null, email: 'jane@example.com' });
    expect(parseEmailAddress('jane@example.com')).toEqual({ name: null, email: 'jane@example.com' });
    expect(parseEmailAddress(null)).toEqual({ name: null, email: '' });
  });

  it('decodes RFC 2047 names', () => {
    expect(parseEmailAddress('=?UTF-8?B?Sm9zw6kgR2FyY8OtYQ==?= <jose@example.com>').name).toBe('José García');
    expect(parseEmailAddress('=?utf-8?Q?Ren=C3=A9e_Smith?= <renee@example.com>').name).toBe('Renée Smith');
  });
});

describe('decodeEncodedWords', () => {
  it('joins adjacent encoded words and leaves plain text alone', () => {
    expect(decodeEncodedWords('=?UTF-8?B?SGVsbG8=?= =?UTF-8?B?IFdvcmxk?=')).toBe('Hello World');
    expect(decodeEncodedWords('Plain Name')).toBe('Plain Name');
  });

  it('keeps an undecodable word as-is', () => {
    expect(decodeEncodedWords('=?NOPE-9?B?SGVsbG8=?=')).toBe('=?NOPE-9?B?SGVsbG8=?=');
  });
});

describe('senderDisplayName', () => {
  it('prefers the raw From header, then the bare from, else null', () => {
    expect(senderDisplayName('"Jane" <jane@example.com>', 'jane@example.com')).toBe('Jane');
    expect(senderDisplayName(undefined, 'Jane Doe <jane@example.com>')).toBe('Jane Doe');
    expect(senderDisplayName(undefined, 'jane@example.com')).toBeNull();
  });

  it('strips characters that would break a header and caps the length', () => {
    expect(senderDisplayName('"A\r\nC" <x@y.com>')).toBe('A C');
    expect(senderDisplayName(`"${'x'.repeat(200)}" <x@y.com>`)!.length).toBe(80);
  });
});

describe('isValidEmail', () => {
  it('accepts ordinary addresses and rejects junk', () => {
    expect(isValidEmail('jane@example.com')).toBe(true);
    expect(isValidEmail('Jane <jane@example.com>')).toBe(false);
    expect(isValidEmail('jane@')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe('isOwnAddress', () => {
  it('matches both Mayells domains, any case, with or without a display name', () => {
    expect(isOwnAddress('info@mayells.com')).toBe(true);
    expect(isOwnAddress('INFO@Mayells.com')).toBe(true);
    expect(isOwnAddress('Mayells <notifications@mayells.com>')).toBe(true);
    expect(isOwnAddress('hello@mayellauctions.com')).toBe(true);
  });

  it('accepts subdomains of our domains', () => {
    expect(isOwnAddress('inbox@inbound.mayells.com')).toBe(true);
    expect(isOwnAddress('bids@mail.mayellauctions.com')).toBe(true);
  });

  it('never lets configuration make another domain ours', () => {
    process.env.ADMIN_EMAIL_ADDRESS = 'hello@inbound.examodels.com';
    expect(isOwnAddress('hello@inbound.examodels.com')).toBe(false);
    expect(getInboundAddress()).toBe('info@mayells.com');
  });

  it('rejects the other domains on the shared Resend account and look-alikes', () => {
    expect(isOwnAddress('hello@inbound.examodels.com')).toBe(false);
    expect(isOwnAddress('team@cannesswimweek.com')).toBe(false);
    expect(isOwnAddress('info@notmayells.com')).toBe(false);
    expect(isOwnAddress('info@mayells.com.evil.io')).toBe(false);
    expect(isOwnAddress('not-an-address')).toBe(false);
  });
});

describe('inbound address + From', () => {
  it('defaults to info@mayells.com and reads the env override', () => {
    expect(getInboundAddress()).toBe('info@mayells.com');
    expect(getInboundDomain()).toBe('mayells.com');
    process.env.ADMIN_EMAIL_ADDRESS = ' "Inbox@Inbound.Mayells.com" ';
    expect(getInboundAddress()).toBe('inbox@inbound.mayells.com');
    expect(getInboundDomain()).toBe('inbound.mayells.com');
  });

  it('ignores a malformed env address', () => {
    process.env.ADMIN_EMAIL_ADDRESS = 'not an address';
    expect(getInboundAddress()).toBe('info@mayells.com');
  });

  it('builds the From header from the default or the env override', () => {
    expect(getAdminFrom()).toBe('Mayells <info@mayells.com>');
    expect(getAdminFromAddress()).toBe('info@mayells.com');
    process.env.ADMIN_EMAIL_FROM = 'Mayells Concierge <hello@mayells.com>';
    expect(getAdminFrom()).toBe('Mayells Concierge <hello@mayells.com>');
    expect(getAdminFromAddress()).toBe('hello@mayells.com');
  });

  it('refuses a From on a domain we cannot send as', () => {
    process.env.ADMIN_EMAIL_FROM = 'Someone <me@gmail.com>';
    expect(getAdminFrom()).toBe('Someone <info@mayells.com>');
  });
});

describe('threadReplyAddress', () => {
  it('plus-tags the inbound address with the thread id', () => {
    expect(threadReplyAddress(THREAD)).toBe(`info+${THREAD}@mayells.com`);
    expect(threadReplyAddress(THREAD.toUpperCase(), 'inbox@inbound.mayells.com')).toBe(`inbox+${THREAD}@inbound.mayells.com`);
  });

  it('falls back to the bare address for anything that is not a uuid', () => {
    expect(threadReplyAddress('nope')).toBe('info@mayells.com');
    expect(threadReplyAddress(THREAD, 'broken')).toBe('broken');
  });
});

describe('parseThreadIdFromAddresses', () => {
  it('finds our tag in any recipient, in any case, with display names', () => {
    expect(parseThreadIdFromAddresses(['someone@gmail.com', `Mayells <INFO+${THREAD.toUpperCase()}@MAYELLS.COM>`])).toBe(THREAD);
  });

  it('ignores tags on other locals, other domains, and non-uuid tags', () => {
    expect(parseThreadIdFromAddresses([`sales+${THREAD}@mayells.com`])).toBeNull();
    expect(parseThreadIdFromAddresses([`info+${THREAD}@mayellauctions.com`])).toBeNull();
    expect(parseThreadIdFromAddresses(['info+hello@mayells.com', null, undefined])).toBeNull();
  });
});

describe('stripPlusTag', () => {
  it('removes only our uuid thread tag', () => {
    expect(stripPlusTag(`info+${THREAD}@mayells.com`)).toBe('info@mayells.com');
    expect(stripPlusTag('info+newsletter@mayells.com')).toBe('info+newsletter@mayells.com');
    expect(stripPlusTag('info@mayells.com')).toBe('info@mayells.com');
  });
});

describe('recipientsOf', () => {
  it('lists envelope recipients first and tolerates missing or malformed fields', () => {
    expect(recipientsOf({ received_for: ['a@x.com'], to: ['b@x.com'], cc: 'c@x.com', bcc: [null, 42] })).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    expect(recipientsOf({})).toEqual([]);
  });
});

describe('ownRecipient', () => {
  it('returns null for mail sent to another business on the account', () => {
    expect(ownRecipient({
      received_for: ['hello@inbound.examodels.com'],
      to: ['hello@inbound.examodels.com'],
      cc: [],
      bcc: [],
    })).toBeNull();
  });

  it('prefers the envelope recipient, which is the only place a Bcc shows', () => {
    expect(ownRecipient({
      received_for: ['info@mayells.com'],
      to: ['someone@gmail.com'],
      cc: [],
      bcc: [],
    })).toBe('info@mayells.com');
  });

  it('finds us in Cc when the customer wrote To someone else', () => {
    expect(ownRecipient({
      to: ['Their Lawyer <lawyer@firm.com>'],
      cc: ['Mayells <info@mayells.com>'],
    })).toBe('info@mayells.com');
  });

  it('files a plus-addressed reply under the plain mailbox', () => {
    expect(ownRecipient({ received_for: [`info+${THREAD}@mayells.com`] })).toBe('info@mayells.com');
  });

  it('tolerates missing or malformed fields', () => {
    expect(ownRecipient({})).toBeNull();
    expect(ownRecipient({ to: 'info@mayells.com', cc: [null, 42] })).toBe('info@mayells.com');
  });
});
