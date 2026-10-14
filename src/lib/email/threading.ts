/**
 * Who a conversation is with. Pure (no DB) so it is unit tested; the inbound
 * webhook uses it to decide whether mail may join an existing thread — only
 * the person the conversation is with may add to it.
 */

export interface ConversationMember {
  id: string;
  direction: 'inbound' | 'outbound';
  fromEmail: string;
  toEmail: string;
  subject?: string | null;
  inReplyToId?: string | null;
}

const FORWARD_SUBJECT = /^\s*fwd?\s*:/i;

/** The other side of one message: who sent it to us, or who we sent it to. */
function counterpartOf(m: Pick<ConversationMember, 'direction' | 'fromEmail' | 'toEmail'>): string {
  return (m.direction === 'inbound' ? m.fromEmail : m.toEmail).trim().toLowerCase();
}

/**
 * A forward stored inside the conversation it forwarded. Forwards start a
 * conversation of their own now (the forward route), but older ones sit in
 * customers' threads, and the person they went to is not a participant
 * there. Same test as the inbox UI: a "Fwd:" subject, or a recipient other
 * than the counterpart of the message it hangs off. A forward that is the
 * root of its own conversation is that conversation's counterpart.
 */
export function isForwardInside(
  member: ConversationMember,
  members: ReadonlyArray<ConversationMember>,
  threadKey: string,
): boolean {
  if (member.direction !== 'outbound' || !member.inReplyToId || member.id === threadKey) return false;
  if (FORWARD_SUBJECT.test(member.subject || '')) return true;
  const parent = members.find((m) => m.id === member.inReplyToId);
  return !!parent && counterpartOf(parent) !== counterpartOf(member);
}

/** Lower-cased addresses a conversation is with (forwards out of it excluded). */
export function conversationCounterparts(
  members: ReadonlyArray<ConversationMember>,
  threadKey: string,
): Set<string> {
  const out = new Set<string>();
  for (const m of members) {
    if (!isForwardInside(m, members, threadKey)) out.add(counterpartOf(m));
  }
  return out;
}
