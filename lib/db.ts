/**
 * LifeSync Database Client
 * Uses Neon (Vercel's recommended Postgres provider)
 */

import { Pool } from '@neondatabase/serverless';

// Initialize pool only if DATABASE_URL is set (skip during build)
let pool: Pool | null = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function query(text: string, params?: (string | number | boolean | null)[]) {
  if (!pool) {
    throw new Error('Database not initialized. DATABASE_URL environment variable is not set.');
  }
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function getClient() {
  if (!pool) {
    throw new Error('Database not initialized. DATABASE_URL environment variable is not set.');
  }
  return pool.connect();
}

// Default export for backward compatibility
export const db = { query };

export default pool;
