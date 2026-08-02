import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// node-postgres (pg), not postgres-js: on Vercel, postgres-js left query
// promises pending forever when a pooled socket died mid-flight — the DB had
// already answered, but the page render hung until the platform gave up
// ("dashboard never loads"). pg surfaces those as errors, which the
// (admin)/error.tsx boundary turns into a retry screen.
//
// DB-side guardrails (applied via ALTER ROLE postgres SET ..., because the
// Supabase transaction pooler ignores per-connection startup parameters):
// statement_timeout=20s, idle_in_transaction_session_timeout=60s.
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 20_000, // release idle sockets before the pooler drops them
  connectionTimeoutMillis: 10_000, // fail fast when a connection can't be made
  keepAlive: true,
});

// A pool-level error (e.g. a dead idle socket) must not crash the process —
// without this handler, node-postgres re-throws and kills the lambda.
pool.on('error', (err) => {
  console.error('[db] idle pool connection error', err.message);
});

export const db = drizzle(pool, { schema });
