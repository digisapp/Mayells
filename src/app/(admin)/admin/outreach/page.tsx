export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { outreachContacts } from '@/db/schema';
import { desc, asc } from 'drizzle-orm';
import { OutreachClient } from './outreach-client';
import type { OutreachContact } from '@/db/schema/outreach';

export default async function AdminOutreachPage() {
  const contacts: OutreachContact[] = await db
    .select()
    .from(outreachContacts)
    .orderBy(asc(outreachContacts.nextFollowUpAt), desc(outreachContacts.createdAt))
    .limit(500);

  return <OutreachClient initialContacts={contacts} />;
}
