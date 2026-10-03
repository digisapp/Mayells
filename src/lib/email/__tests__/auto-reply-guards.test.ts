import { describe, expect, it } from 'vitest';
import { autoReplySuppressionReason } from '../auto-reply-guards';

describe('autoReplySuppressionReason', () => {
  it('allows an ordinary customer email', () => {
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', subject: 'Rolex appraisal', headers: { 'message-id': '<x@y>' } })).toBeNull();
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
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { 'Auto-Submitted': 'auto-replied' } })).toMatch(/Auto-Submitted/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { 'Auto-Submitted': 'no' } })).toBeNull();
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { Precedence: 'bulk' } })).toMatch(/Precedence/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { 'List-Unsubscribe': '<mailto:x>' } })).toMatch(/list/);
    expect(autoReplySuppressionReason({ from: 'jane@gmail.com', headers: { 'X-Auto-Response-Suppress': ['OOF', 'DR'] } })).toMatch(/list|automated/);
  });
});
