import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

config({ path: join(__dirname, '..', '.env.local') });

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });

async function runSeed() {
  const sqlPath = join(__dirname, 'seed.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  console.log('Executing seed SQL...');
  try {
    await client.unsafe(sql);
    console.log('Seed data complete!');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ERROR:', message);
    throw err;
  }

  // Run images seed
  const imagesSqlPath = join(__dirname, 'seed-images.sql');
  const imagesSql = readFileSync(imagesSqlPath, 'utf-8');
  console.log('Adding images...');
  try {
    await client.unsafe(imagesSql);
    console.log('Images complete!');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Images ERROR:', message);
    throw err;
  }

  process.exit(0);
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
