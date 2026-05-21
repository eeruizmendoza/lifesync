import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('Running migration 001_add_encryption_password.sql...');

    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/001_add_encryption_password.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Execute migration
    const client = await pool.connect();
    try {
      await client.query(sql);
      console.log('✅ Migration completed successfully');
      console.log('Added columns: encryption_password_hash, encryption_key_salt, encryption_key_encrypted, encryption_enabled');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
