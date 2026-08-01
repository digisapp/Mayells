import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Serverless-safe pool settings. Without idle_timeout/max_lifetime, warm
// Vercel instances hold sockets the Supabase pooler has already dropped, and
// the next query hangs for minutes on the dead connection instead of
// reconnecting — pages stall mid-stream and "never load".
const client = postgres(connectionString, {
  prepare: false,
  max: 10,
  ssl: 'require',
  idle_timeout: 20, // close idle connections before the pooler drops them
  max_lifetime: 60 * 15, // recycle connections every 15 minutes
  connect_timeout: 10, // fail fast instead of hanging on a dead host
});

export const db = drizzle(client, { schema });
