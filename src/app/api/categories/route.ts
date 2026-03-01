import { NextResponse } from 'next/server';
import { db } from '@/db';
import { categories } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  try {
    const result = await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder));

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Categories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
