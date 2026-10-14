import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * The `type` values an emailed `?token_hash=` link may carry: sign-up
 * confirmation (`email`, or the older `signup`) and password reset. The app
 * sends no magic-link, invite or email-change mail, so those are refused
 * rather than passed to verifyOtp, whose type is an open string.
 */
const EMAIL_OTP_TYPES = ['recovery', 'signup', 'email'] as const satisfies readonly EmailOtpType[];

export type EmailLinkType = (typeof EMAIL_OTP_TYPES)[number];

export function emailOtpType(value: string | null | undefined): EmailLinkType | null {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value ?? '') ? (value as EmailLinkType) : null;
}

/**
 * The confirm page an emailed link opens. The token is only spent when the
 * reader presses Continue there (a same-site POST), so a link someone else
 * forwards can't silently sign this browser into their account, and a mail
 * scanner that opens links can't use it up.
 */
export function emailLinkConfirmPath(tokenHash: string, type: EmailLinkType, next: string): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type, next });
  return `/auth/confirm?${params.toString()}`;
}

/** Where a verified link lands: a reset with no explicit `next` sets the new password. */
export function emailLinkDestination(type: EmailLinkType, next: string): string {
  return type === 'recovery' && next === '/' ? '/reset-password' : next;
}
