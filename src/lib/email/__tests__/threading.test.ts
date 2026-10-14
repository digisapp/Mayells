import { describe, expect, it } from 'vitest';
import { conversationCounterparts, isForwardInside, type ConversationMember } from '../threading';

const ROOT = 'root-1';

const customerMail: ConversationMember = { id: ROOT, direction: 'inbound', fromEmail: 'Jane@Gmail.com', toEmail: 'info@mayells.com', subject: 'Rolex' };
const ourReply: ConversationMember = { id: 'reply-1', direction: 'outbound', fromEmail: 'info@mayells.com', toEmail: 'jane@gmail.com', subject: 'Re: Rolex', inReplyToId: ROOT };

describe('conversationCounterparts', () => {
  it('is the customer, whichever side of the conversation the message is on', () => {
    expect([...conversationCounterparts([customerMail, ourReply], ROOT)]).toEqual(['jane@gmail.com']);
  });

  it('leaves out someone a message was forwarded to (older forwards kept in the thread)', () => {
    const byRecipient: ConversationMember = { id: 'fwd-1', direction: 'outbound', fromEmail: 'info@mayells.com', toEmail: 'expert@watches.com', subject: 'Have a look', inReplyToId: ROOT };
    const bySubject: ConversationMember = { id: 'fwd-2', direction: 'outbound', fromEmail: 'info@mayells.com', toEmail: 'other@watches.com', subject: 'Fwd: Rolex', inReplyToId: 'reply-1' };
    const members = [customerMail, ourReply, byRecipient, bySubject];
    expect(isForwardInside(byRecipient, members, ROOT)).toBe(true);
    expect(isForwardInside(bySubject, members, ROOT)).toBe(true);
    expect(isForwardInside(ourReply, members, ROOT)).toBe(false);
    expect(conversationCounterparts(members, ROOT)).toEqual(new Set(['jane@gmail.com']));
  });

  it('counts the recipient of a forward that roots its own conversation', () => {
    const forwardRoot: ConversationMember = { id: 'fwd-3', direction: 'outbound', fromEmail: 'info@mayells.com', toEmail: 'expert@watches.com', subject: 'Fwd: Rolex', inReplyToId: ROOT };
    const theirAnswer: ConversationMember = { id: 'ans-1', direction: 'inbound', fromEmail: 'expert@watches.com', toEmail: 'info@mayells.com', subject: 'Re: Fwd: Rolex', inReplyToId: 'fwd-3' };
    expect(conversationCounterparts([forwardRoot, theirAnswer], 'fwd-3')).toEqual(new Set(['expert@watches.com']));
  });
});
