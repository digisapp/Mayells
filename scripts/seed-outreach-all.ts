import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { outreachContacts } from '../src/db/schema/outreach';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';

const DATASETS: Record<string, string> = {
  outreach: 'outreach.json',
  florida: 'outreach-florida.json',
  expand: 'outreach-expand.json',
  ftl: 'outreach-ftl.json',
  boutique: 'outreach-boutique.json',
};

interface Lead {
  companyName: string;
  contactName?: string;
  title?: string;
  email?: string;
  phone?: string;
  website?: string;
  category: string;
  source: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
}

function loadLeads(name: string): Lead[] {
  const filePath = join(__dirname, 'data', DATASETS[name]);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

async function seed(datasetNames: string[]) {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  try {
    const existing = await db.execute(sql`SELECT count(*) as cnt FROM outreach_contacts`);
    console.log(`Existing leads: ${existing[0].cnt}`);

    let totalAdded = 0;
    let totalSkipped = 0;

    for (const name of datasetNames) {
      const leads = loadLeads(name);
      console.log(`\nSeeding "${name}" (${leads.length} leads)...`);

      let added = 0;
      let skipped = 0;

      for (const lead of leads) {
        const [dup] = await db.execute(
          sql`SELECT id FROM outreach_contacts WHERE company_name = ${lead.companyName} LIMIT 1`
        );
        if (dup) {
          skipped++;
          continue;
        }

        await db.insert(outreachContacts).values({
          companyName: lead.companyName,
          contactName: lead.contactName || null,
          title: lead.title || null,
          email: lead.email || null,
          phone: lead.phone || null,
          website: lead.website || null,
          category: lead.category as any,
          source: lead.source,
          address: lead.address || null,
          city: lead.city || null,
          state: lead.state || null,
          notes: lead.notes || null,
        });
        added++;
      }

      console.log(`  Added: ${added}, Skipped (duplicates): ${skipped}`);
      totalAdded += added;
      totalSkipped += skipped;
    }

    const final = await db.execute(sql`SELECT count(*) as cnt FROM outreach_contacts`);
    console.log(`\nTotal added: ${totalAdded}, Total skipped: ${totalSkipped}`);
    console.log(`Total leads now: ${final[0].cnt}`);
  } finally {
    await client.end();
  }
}

// Parse CLI arguments
const arg = process.argv[2] || 'all';
const validNames = Object.keys(DATASETS);

let datasetNames: string[];
if (arg === 'all') {
  datasetNames = validNames;
} else if (validNames.includes(arg)) {
  datasetNames = [arg];
} else {
  console.error(`Unknown dataset: "${arg}". Valid options: all, ${validNames.join(', ')}`);
  process.exit(1);
}

seed(datasetNames)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
