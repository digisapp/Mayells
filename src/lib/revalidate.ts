import { revalidatePath } from 'next/cache';

/**
 * Revalidate the ISR-cached public catalog after lot/auction data changes
 * (new bid, lot edit, auction open/close/settle). Pages re-render in the
 * background on the next request, so these surfaces stay near-live while
 * still serving from the CDN.
 */
export function revalidatePublicCatalog(auctionSlug?: string | null) {
  try {
    revalidatePath('/');
    revalidatePath('/auctions');
    revalidatePath('/lots');
    revalidatePath('/categories/[slug]', 'page');
    if (auctionSlug) revalidatePath(`/auctions/${auctionSlug}`);
  } catch {
    // Revalidation is best-effort; never let it break the mutation itself.
  }
}
