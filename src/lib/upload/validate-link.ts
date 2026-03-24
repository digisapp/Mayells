import { db } from '@/db';
import { uploadLinks, sellerProspects } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function validateLink(token: string) {
  const [row] = await db
    .select({
      link: uploadLinks,
      prospectName: sellerProspects.fullName,
    })
    .from(uploadLinks)
    .innerJoin(sellerProspects, eq(uploadLinks.prospectId, sellerProspects.id))
    .where(eq(uploadLinks.token, token))
    .limit(1);

  return row ?? null;
}
