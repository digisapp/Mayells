import { describe, expect, it } from 'vitest';
import { parseAuthResults, SENDER_WARNINGS, senderAuthenticated, senderFailedDmarc, senderWarningOf } from '../sender-auth';

describe('sender verdicts', () => {
  it('reads only the receiving server’s verdict', () => {
    expect(senderAuthenticated(parseAuthResults('amazonses.com; spf=pass; dkim=pass; dmarc=pass header.from=gmail.com'))).toBe(true);
    expect(senderAuthenticated(parseAuthResults('mx.attacker.test; dmarc=pass'))).toBe(false);
  });

  it('calls a DMARC fail a fail, and none or no verdict not one', () => {
    expect(senderFailedDmarc(parseAuthResults('amazonses.com; spf=pass; dmarc=fail header.from=gmail.com'))).toBe(true);
    expect(senderFailedDmarc(parseAuthResults('amazonses.com; spf=pass; dmarc=none'))).toBe(false);
    expect(senderFailedDmarc(parseAuthResults('amazonses.com; spf=pass'))).toBe(false);
    expect(senderFailedDmarc(parseAuthResults(null))).toBe(false);
    // Two folded verdicts are refused outright, so neither counts.
    expect(senderFailedDmarc(parseAuthResults('amazonses.com; dmarc=fail amazonses.com; dmarc=pass'))).toBe(false);
  });
});

describe('senderWarningOf', () => {
  it('finds the webhook’s warning at the front of a summary', () => {
    expect(senderWarningOf(`${SENDER_WARNINGS.dmarcFail} Wants a Rolex appraised.`)).toBe(SENDER_WARNINGS.dmarcFail);
    expect(senderWarningOf(SENDER_WARNINGS.replyToOnly)).toBe(SENDER_WARNINGS.replyToOnly);
    expect(senderWarningOf('Wants a Rolex appraised.')).toBeNull();
    expect(senderWarningOf(null)).toBeNull();
  });
});
