import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { categories, bidIncrements } from '../src/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });
const db = drizzle(client);

const CATEGORIES = [
  { name: 'Art', slug: 'art', description: 'Contemporary, Modern, and Old Masters', sortOrder: 1 },
  { name: 'Antiques', slug: 'antiques', description: 'Fine antiques and period furniture', sortOrder: 2 },
  { name: 'Luxury', slug: 'luxury', description: 'Watches, cars, and rare collectibles', sortOrder: 3 },
  { name: 'Fashion', slug: 'fashion', description: 'Haute couture, vintage, and accessories', sortOrder: 4 },
  { name: 'Jewelry', slug: 'jewelry', description: 'Fine jewelry and precious stones', sortOrder: 5 },
  { name: 'Design', slug: 'design', description: 'Furniture, lighting, and objects', sortOrder: 6 },
];

const BID_INCREMENTS = [
  { fromAmount: 0, toAmount: 9_999, increment: 1_000 },
  { fromAmount: 10_000, toAmount: 49_999, increment: 2_500 },
  { fromAmount: 50_000, toAmount: 99_999, increment: 5_000 },
  { fromAmount: 100_000, toAmount: 199_999, increment: 10_000 },
  { fromAmount: 200_000, toAmount: 499_999, increment: 20_000 },
  { fromAmount: 500_000, toAmount: 999_999, increment: 50_000 },
  { fromAmount: 1_000_000, toAmount: 1_999_999, increment: 100_000 },
  { fromAmount: 2_000_000, toAmount: 4_999_999, increment: 200_000 },
  { fromAmount: 5_000_000, toAmount: 9_999_999, increment: 500_000 },
  { fromAmount: 10_000_000, toAmount: 999_999_999, increment: 1_000_000 },
];

async function seed() {
  console.log('Seeding categories...');
  for (const cat of CATEGORIES) {
    await db.insert(categories).values(cat).onConflictDoNothing();
  }
  console.log(`Seeded ${CATEGORIES.length} categories`);

  console.log('Seeding bid increments...');
  for (const inc of BID_INCREMENTS) {
    await db.insert(bidIncrements).values(inc);
  }
  console.log(`Seeded ${BID_INCREMENTS.length} bid increment tiers`);

  console.log('Done!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
