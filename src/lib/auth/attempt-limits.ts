import { peekRateLimit, rateLimit } from '@/lib/rate-limit';

/**
 * Brute-force and email-spam limits for the auth endpoints.
 *
 * A counter keyed on the email alone lets anyone exhaust it for someone
 * else's address: ten wrong passwords from a stranger used to lock the owner
 * (the admin included) out for fifteen minutes. So the tight limits key on
 * (email, IP), and the email-only limit is a much higher ceiling that only a
 * distributed attack reaches. The per-IP limit bounds each sender, which also
 * bounds how fast any one sender can push an address toward its ceiling.
 * Everything fails closed when Redis is configured but erroring.
 */

const LOGIN_WINDOW_SECONDS = 900;
export const LOGIN_RETRY_AFTER = String(LOGIN_WINDOW_SECONDS);
const LOGIN_IP = { maxRequests: 10, windowSeconds: LOGIN_WINDOW_SECONDS, failClosed: true };
const LOGIN_PAIR_FAILURES = { maxRequests: 10, windowSeconds: LOGIN_WINDOW_SECONDS, failClosed: true };
const LOGIN_EMAIL_FAILURES = { maxRequests: 50, windowSeconds: LOGIN_WINDOW_SECONDS, failClosed: true };

const pairFailureKey = (ip: string, email: string) => `auth:login:fail:ip-email:${ip}:${email}`;
const emailFailureKey = (email: string) => `auth:login:fail:email:${email}`;

/**
 * Whether a sign-in may be attempted. Every attempt counts against the IP;
 * the (email, IP) and email-only limits only look at failures recorded by
 * recordLoginFailure, so they never block on someone else's successes.
 */
export async function checkLoginAttempt(ip: string, rawEmail: string): Promise<'ok' | 'ip' | 'account'> {
  const email = rawEmail.toLowerCase();
  const [ipRes, pairRes, emailRes] = await Promise.all([
    rateLimit(`auth:login:ip:${ip}`, LOGIN_IP),
    peekRateLimit(pairFailureKey(ip, email), LOGIN_PAIR_FAILURES),
    peekRateLimit(emailFailureKey(email), LOGIN_EMAIL_FAILURES),
  ]);
  if (!ipRes.success) return 'ip';
  if (!pairRes.success || !emailRes.success) return 'account';
  return 'ok';
}

/** Count a wrong password against (email, IP) and the email's ceiling. */
export async function recordLoginFailure(ip: string, rawEmail: string): Promise<void> {
  const email = rawEmail.toLowerCase();
  await Promise.all([
    rateLimit(pairFailureKey(ip, email), LOGIN_PAIR_FAILURES),
    rateLimit(emailFailureKey(email), LOGIN_EMAIL_FAILURES),
  ]);
}

export const AUTH_EMAIL_RETRY_AFTER = '3600';

/**
 * Whether to send an auth email (password reset, confirmation resend) to
 * `email`. Each request sends a real email, so every request counts. The
 * address's ceiling is only charged once the sender's own limits pass, so
 * one sender can add at most three to it an hour.
 */
export async function allowAuthEmail(kind: 'forgot' | 'resend', ip: string, rawEmail: string): Promise<boolean> {
  const email = rawEmail.toLowerCase();
  const [{ success: ipOk }, { success: pairOk }] = await Promise.all([
    rateLimit(`auth:${kind}:ip:${ip}`, { maxRequests: 10, windowSeconds: 3600, failClosed: true }),
    rateLimit(`auth:${kind}:ip-email:${ip}:${email}`, { maxRequests: 3, windowSeconds: 3600, failClosed: true }),
  ]);
  if (!ipOk || !pairOk) return false;
  const { success: emailOk } = await rateLimit(`auth:${kind}:email:${email}`, {
    maxRequests: 10,
    windowSeconds: 3600,
    failClosed: true,
  });
  return emailOk;
}
