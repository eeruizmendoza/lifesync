const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Running migration...');

    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/001_add_encryption_password.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Execute migration
    const result = await pool.query(sql);

    console.log('✅ Migration completed successfully');
    console.log('Changes applied:', result);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
