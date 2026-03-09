import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  prepare: false,
  max: 10,
  ssl: 'require',
});

export const db = drizzle(client, { schema });
