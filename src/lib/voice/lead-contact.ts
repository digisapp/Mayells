/**
 * A number a specialist can call back: at least ten digits once spaces and
 * punctuation are gone. Withheld caller ID ("anonymous", "restricted",
 * "unknown") and a number half-heard over the line have fewer, and count as
 * no number. Returned as given, since the prospect keeps it as text.
 */
export function usablePhone(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\D/g, '').length >= 10 ? trimmed : undefined;
}

/**
 * Why a phone lead can't be saved yet, as an instruction for the voice
 * agent to act on while the caller is still on the line; null when there is
 * a way to reach them.
 */
export function missingContactMessage(contact: {
  phone: string | undefined;
  email: string | undefined;
  /** A number was given but is too short to dial. */
  phoneHeard: boolean;
  /** An email was given but did not parse. */
  emailHeard: boolean;
}): string | null {
  if (contact.phone || contact.email) return null;
  if (contact.phoneHeard && contact.emailHeard) {
    return 'Neither the callback number nor the email came through clearly. Ask for the full number with the area code, or have them spell the email again.';
  }
  if (contact.phoneHeard) {
    return 'The callback number is incomplete. Ask for the full number with the area code, or for an email address.';
  }
  if (contact.emailHeard) {
    return 'The email address did not come through clearly and there is no callback number. Ask for a callback number, or have them spell the email again.';
  }
  return 'There is no way to reach the caller yet. Ask for a callback number or an email address.';
}
