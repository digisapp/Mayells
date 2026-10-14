/**
 * Admin two-factor (TOTP) gating — pure helpers shared by the middleware, the
 * challenge page and the enrollment page.
 *
 * Model: MFA is opt-in per account (enrolled from the Security tab of
 * /admin/settings). Once an account has a VERIFIED TOTP factor, every admin
 * page and every API call from that account requires an `aal2` session, i.e.
 * the code was entered after password login. Accounts with no verified
 * factor are unaffected.
 */

export type AssuranceLevel = 'aal1' | 'aal2' | (string & {});

export interface FactorLike {
  factor_type?: string | null;
  status?: string | null;
}

/** True when the user has at least one verified TOTP factor. */
export function hasVerifiedTotpFactor(factors: FactorLike[] | null | undefined): boolean {
  if (!factors || factors.length === 0) return false;
  return factors.some((f) => f.factor_type === 'totp' && f.status === 'verified');
}

/**
 * Read an Auth admin `mfa.listFactors` result. `known` is false when Auth
 * answered with an error or not at all (null): the account is then counted
 * as enrolled (fail closed, so an aal1 session is refused rather than waved
 * through) and the caller must not cache the answer.
 */
export function enrollmentFromFactorsResult(
  result: { data: { factors?: FactorLike[] | null } | null; error: unknown } | null | undefined,
): { enrolled: boolean; known: boolean } {
  if (!result || result.error || !result.data) return { enrolled: true, known: false };
  return { enrolled: hasVerifiedTotpFactor(result.data.factors), known: true };
}

/**
 * Whether the current session must complete an MFA challenge before it may
 * act. Only sessions on accounts that HAVE enrolled a factor are gated, and
 * only while they are still at aal1.
 */
export function needsMfaChallenge(input: {
  mfaEnrolled: boolean;
  aal: AssuranceLevel | null | undefined;
}): boolean {
  if (!input.mfaEnrolled) return false;
  return input.aal !== 'aal2';
}

/** Paths that must stay reachable at aal1 so the user can complete (or abandon) the challenge. */
export const MFA_EXEMPT_PREFIXES = ['/admin/login', '/api/auth/'] as const;

export function isMfaExemptPath(pathname: string): boolean {
  return MFA_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const MFA_CHALLENGE_PATH = '/admin/login/mfa';
