/**
 * Badge colours and helpers shared by the users list and the person page.
 * (Lives next to the pages rather than inside one of them: Next rejects extra
 * named exports from a page.tsx.)
 */

export function verificationLabel(u: {
  identityVerifiedAt: string | null;
  cardVerifiedAt: string | null;
}): { label: string; className: string } {
  if (u.identityVerifiedAt) return { label: 'ID verified', className: 'bg-green-100 text-green-800' };
  if (u.cardVerifiedAt) return { label: 'Card', className: 'bg-blue-100 text-blue-800' };
  return { label: 'Registered', className: 'bg-gray-100 text-gray-600' };
}

export const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-800',
  auctioneer: 'bg-purple-100 text-purple-800',
  seller: 'bg-blue-100 text-blue-800',
  buyer: 'bg-green-100 text-green-800',
};

export const accountStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-yellow-100 text-yellow-800',
  banned: 'bg-red-100 text-red-800',
};

export const USER_ROLES = ['buyer', 'seller', 'auctioneer', 'admin'] as const;
export const ACCOUNT_STATUSES = ['active', 'suspended', 'banned'] as const;

/** Extract an error message without assuming the body is JSON. */
export async function readError(res: Response, fallback: string): Promise<string> {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      const d = await res.json();
      if (d && typeof d.error === 'string') return d.error;
    } catch { /* fall through */ }
  }
  return `${fallback} (${res.status})`;
}
