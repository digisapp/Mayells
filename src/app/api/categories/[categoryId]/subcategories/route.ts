import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { categories, subcategories } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { logger } from '@/lib/logger';

/**
 * Public read of a department's subcategories. Subcategories carry no active
 * flag of their own, and the parent's is deliberately NOT enforced: a lot
 * catalogued under a department that was later deactivated must still open in
 * the editor with its subcategory list intact. Names are not confidential.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  try {
    const { categoryId } = await params;
    if (!UUID_RE.test(categoryId)) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!category) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    const result = await db
      .select({
        id: subcategories.id,
        categoryId: subcategories.categoryId,
        name: subcategories.name,
        slug: subcategories.slug,
        sortOrder: subcategories.sortOrder,
      })
      .from(subcategories)
      .where(eq(subcategories.categoryId, categoryId))
      .orderBy(asc(subcategories.sortOrder), asc(subcategories.name));

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error('Subcategories error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
