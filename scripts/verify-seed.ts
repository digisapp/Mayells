import postgres from 'postgres';
import { join } from 'path';
import { config } from 'dotenv';

config({ path: join(__dirname, '..', '.env.local') });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });

async function verify() {
  const categories = await client`SELECT count(*) as c FROM categories`;
  const auctions = await client`SELECT count(*) as c FROM auctions`;
  const lots = await client`SELECT count(*) as c FROM lots`;
  const auctionLots = await client`SELECT count(*) as c FROM auction_lots`;

  console.log('=== Database Summary ===');
  console.log(`Categories: ${categories[0].c}`);
  console.log(`Auctions: ${auctions[0].c}`);
  console.log(`Lots: ${lots[0].c}`);
  console.log(`Auction-Lot links: ${auctionLots[0].c}`);

  const byType = await client`SELECT sale_type, count(*) as c FROM lots GROUP BY sale_type`;
  console.log('\n--- Lots by Sale Type ---');
  for (const row of byType) {
    console.log(`  ${row.sale_type}: ${row.c}`);
  }

  const byStatus = await client`SELECT status, count(*) as c FROM lots GROUP BY status`;
  console.log('\n--- Lots by Status ---');
  for (const row of byStatus) {
    console.log(`  ${row.status}: ${row.c}`);
  }

  const byCat = await client`SELECT c.name, count(l.id) as c FROM lots l JOIN categories c ON l.category_id = c.id GROUP BY c.name ORDER BY c.name`;
  console.log('\n--- Lots by Category ---');
  for (const row of byCat) {
    console.log(`  ${row.name}: ${row.c}`);
  }

  // Price range analysis
  console.log('\n--- Price Range (in dollars) ---');

  const galleryPrices = await client`SELECT title, buy_now_price FROM lots WHERE sale_type = 'gallery' AND buy_now_price IS NOT NULL ORDER BY buy_now_price ASC`;
  console.log('\nGallery (Buy Now):');
  for (const row of galleryPrices) {
    console.log(`  $${(Number(row.buy_now_price) / 100).toLocaleString()} — ${row.title}`);
  }

  const auctionPrices = await client`SELECT title, hammer_price, estimate_low, estimate_high FROM lots WHERE sale_type = 'auction' AND hammer_price IS NOT NULL ORDER BY hammer_price ASC`;
  console.log('\nAuction (Hammer Prices):');
  for (const row of auctionPrices) {
    console.log(`  $${(Number(row.hammer_price) / 100).toLocaleString()} — ${row.title}`);
  }

  const privatePrices = await client`SELECT title, estimate_low, estimate_high FROM lots WHERE sale_type = 'private' ORDER BY estimate_low ASC`;
  console.log('\nPrivate Sales (Estimates):');
  for (const row of privatePrices) {
    console.log(`  $${(Number(row.estimate_low) / 100).toLocaleString()} – $${(Number(row.estimate_high) / 100).toLocaleString()} — ${row.title}`);
  }

  const upcoming = await client`SELECT title, estimate_low, estimate_high FROM lots WHERE status = 'in_auction' ORDER BY estimate_low ASC`;
  console.log('\nUpcoming Auctions (Estimates):');
  for (const row of upcoming) {
    console.log(`  $${(Number(row.estimate_low) / 100).toLocaleString()} – $${(Number(row.estimate_high) / 100).toLocaleString()} — ${row.title}`);
  }

  process.exit(0);
}

verify().catch(err => { console.error(err); process.exit(1); });
