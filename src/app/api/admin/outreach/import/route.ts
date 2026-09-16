import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { outreachContacts } from '@/db/schema';
import { inArray, sql } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { parseOutreachCategory } from '@/lib/config/outreach';
import { logger } from '@/lib/logger';

const MAX_ROWS = 2000;

const importSchema = z.object({
  csv: z.string().min(1, 'Paste or upload a CSV').max(5_000_000),
});

// ─── Tiny RFC 4180 parser (quotes, escaped quotes, CRLF) ─────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === '\t') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

// Header aliases → canonical column
const HEADER_MAP: Record<string, string> = {
  companyname: 'companyName', company: 'companyName', firm: 'companyName', organization: 'companyName',
  contactname: 'contactName', contact: 'contactName', name: 'contactName', fullname: 'contactName',
  email: 'email', emailaddress: 'email',
  phone: 'phone', phonenumber: 'phone', telephone: 'phone',
  category: 'category', type: 'category',
  city: 'city',
  state: 'state', region: 'state',
  title: 'title', website: 'website', notes: 'notes', source: 'source', address: 'address',
};

function normaliseHeader(h: string): string | null {
  return HEADER_MAP[h.trim().toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

const rowSchema = z.object({
  companyName: z.string().trim().min(1).max(300),
  contactName: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(300).optional(),
  phone: z.string().trim().max(50).optional(),
  category: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  title: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  source: z.string().trim().max(200).optional(),
  address: z.string().trim().max(500).optional(),
});

/**
 * POST /api/admin/outreach/import — bulk-create contacts from CSV text.
 * Header row required (companyName, contactName, email, phone, category,
 * city, state — aliases accepted). Rows are de-duplicated by email against
 * the file and the table; rows without an email de-dupe on company name.
 */
export async function POST(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = importSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const table = parseCsv(parsed.data.csv);
    if (table.length < 2) {
      return NextResponse.json({ error: 'The CSV needs a header row and at least one contact' }, { status: 400 });
    }
    const [headerRow, ...dataRows] = table;
    const columns = headerRow.map(normaliseHeader);
    if (!columns.includes('companyName')) {
      return NextResponse.json(
        { error: 'No "companyName" (or "company") column found in the header row' },
        { status: 400 },
      );
    }
    if (dataRows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Too many rows — import at most ${MAX_ROWS} at a time` }, { status: 400 });
    }

    const errors: Array<{ row: number; error: string }> = [];
    const candidates: Array<{ row: number; data: z.infer<typeof rowSchema> }> = [];

    dataRows.forEach((cells, idx) => {
      const rowNumber = idx + 2; // 1-based, after the header
      const record: Record<string, string> = {};
      columns.forEach((col, i) => {
        const v = cells[i]?.trim();
        if (col && v) record[col] = v;
      });
      const r = rowSchema.safeParse(record);
      if (!r.success) {
        const issue = r.error.issues[0];
        errors.push({ row: rowNumber, error: `${String(issue.path[0] ?? 'row')}: ${issue.message}` });
        return;
      }
      candidates.push({ row: rowNumber, data: r.data });
    });

    // Dedupe within the file
    const seenEmails = new Set<string>();
    const seenCompanies = new Set<string>();
    const unique: typeof candidates = [];
    let duplicateInFile = 0;
    for (const c of candidates) {
      const key = c.data.email ?? null;
      const companyKey = c.data.companyName.toLowerCase();
      if (key) {
        if (seenEmails.has(key)) { duplicateInFile++; continue; }
        seenEmails.add(key);
      } else {
        if (seenCompanies.has(companyKey)) { duplicateInFile++; continue; }
        seenCompanies.add(companyKey);
      }
      unique.push(c);
    }

    // Dedupe against the table
    const emailsToCheck = Array.from(seenEmails);
    const companiesToCheck = unique.filter((c) => !c.data.email).map((c) => c.data.companyName.toLowerCase());
    const [existingEmails, existingCompanies] = await Promise.all([
      emailsToCheck.length
        ? db
            .select({ email: sql<string>`lower(${outreachContacts.email})` })
            .from(outreachContacts)
            .where(inArray(sql`lower(${outreachContacts.email})`, emailsToCheck))
        : Promise.resolve([]),
      companiesToCheck.length
        ? db
            .select({ company: sql<string>`lower(${outreachContacts.companyName})` })
            .from(outreachContacts)
            .where(inArray(sql`lower(${outreachContacts.companyName})`, companiesToCheck))
        : Promise.resolve([]),
    ]);
    const existingEmailSet = new Set(existingEmails.map((e) => e.email));
    const existingCompanySet = new Set(existingCompanies.map((c) => c.company));

    let duplicateExisting = 0;
    const toInsert = unique.filter((c) => {
      if (c.data.email ? existingEmailSet.has(c.data.email) : existingCompanySet.has(c.data.companyName.toLowerCase())) {
        duplicateExisting++;
        return false;
      }
      return true;
    });

    let imported = 0;
    if (toInsert.length > 0) {
      const values = toInsert.map(({ data }) => ({
        companyName: data.companyName,
        contactName: data.contactName ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        category: parseOutreachCategory(data.category),
        city: data.city ?? null,
        state: data.state ?? null,
        title: data.title ?? null,
        website: data.website
          ? (/^[a-z][a-z0-9+.-]*:\/\//i.test(data.website) ? data.website : `https://${data.website}`)
          : null,
        notes: data.notes ?? null,
        source: data.source ?? 'csv import',
        address: data.address ?? null,
      }));
      // Chunked so a large paste stays within parameter limits
      for (let i = 0; i < values.length; i += 200) {
        const inserted = await db.insert(outreachContacts).values(values.slice(i, i + 200)).returning({ id: outreachContacts.id });
        imported += inserted.length;
      }
    }

    logger.info('Outreach CSV import', { imported, duplicateInFile, duplicateExisting, invalid: errors.length, adminId: admin.id });

    return NextResponse.json({
      imported,
      skipped: { duplicates: duplicateInFile + duplicateExisting, invalid: errors.length },
      errors: errors.slice(0, 25),
    });
  } catch (error) {
    logger.error('Outreach import error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
