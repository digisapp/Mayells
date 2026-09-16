/**
 * Sentinel-email rules for shadow seller accounts. Kept dependency-free so
 * client components (the admin users list) can badge these accounts without
 * pulling the Postgres driver into the browser bundle. The account-minting
 * logic lives in ./shadow.ts (server only).
 */

// Prospects can be created without an email (phone/walk-in). The users table
// requires a unique email, so shadow rows for them get a sentinel address.
// Anything under this domain must never be emailed.
export const SHADOW_EMAIL_DOMAIN = 'no-email.mayells.invalid';

export function isSentinelEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${SHADOW_EMAIL_DOMAIN}`);
}
