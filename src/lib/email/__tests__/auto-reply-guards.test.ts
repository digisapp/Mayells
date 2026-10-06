import { describe, expect, it } from 'vitest';
import { autoReplySuppressionReason } from '../auto-reply-guards';

const PASS = { 'Authentication-Results': 'amazonses.com; spf=pass smtp.mailfrom=gmail.com; dkim=pass header.i=@gmail.com; dmarc=pass header.from=gmail.com' };

describe('autoReplySuppressionReason', () => {
  it('allows an ordinary customer email once the sender address passed DMARC', () => {
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', subject: 'Rolex appraisal', headers: { ...PASS, 'message-id': '<x@y>' } })).toBeNull();
  });

  it('never answers a sender whose From address is not proven (a reply would land on a third party)', () => {
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', subject: 'Rolex appraisal', headers: { 'message-id': '<x@y>' } })).toMatch(/not authenticated/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { 'Authentication-Results': 'amazonses.com; spf=pass; dmarc=none' } })).toMatch(/not authenticated/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { 'Authentication-Results': 'amazonses.com; dkim=pass; dmarc=fail' } })).toMatch(/not authenticated/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { 'Authentication-Results': 'mx.attacker.test; dmarc=pass' } })).toMatch(/not authenticated/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { 'Authentication-Results': `${PASS['Authentication-Results']} amazonses.com; dmarc=fail` } })).toMatch(/not authenticated/);
  });

  it('never answers our own domains or automated senders', () => {
    expect(autoReplySuppressionReason({ from: 'notifications@mayells.com' })).toMatch(/own domain/);
    expect(autoReplySuppressionReason({ from: 'no-reply@shop.com' })).toMatch(/automated/);
    expect(autoReplySuppressionReason({ from: 'MAILER-DAEMON@mx.example.com' })).toMatch(/automated/);
    expect(autoReplySuppressionReason({ from: 'bounces@list.example.com' })).toMatch(/automated/);
    expect(autoReplySuppressionReason({ from: '' })).toBe('no sender address');
  });

  it('spots out-of-office and bounce subjects', () => {
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', subject: 'Automatic reply: Rolex' })).toMatch(/subject/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', subject: 'Undeliverable: hi' })).toMatch(/subject/);
  });

  it('honours the automation headers in any case', () => {
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { ...PASS, 'Auto-Submitted': 'auto-replied' } })).toMatch(/Auto-Submitted/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { ...PASS, 'Auto-Submitted': 'no' } })).toBeNull();
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { ...PASS, Precedence: 'bulk' } })).toMatch(/Precedence/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { ...PASS, 'List-Unsubscribe': '<mailto:x>' } })).toMatch(/list/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { ...PASS, 'X-Auto-Response-Suppress': ['OOF', 'DR'] } })).toMatch(/list|automated/);
  });
});
