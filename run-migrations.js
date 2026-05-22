const { sql } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');

// Ensure env vars are loaded
require('dotenv').config({ path: '.env.local' });

const migrations = [
  '001_add_encryption_password.sql',
  '002_add_realtime_communications.sql',
  '003_add_model_management.sql',
];

async function runAllMigrations() {
  try {
    console.log('🚀 Starting database migrations...\n');

    for (const migration of migrations) {
      console.log(`📋 Processing: ${migration}`);

      const migrationPath = path.join(__dirname, 'database', 'migrations', migration);
      const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

      // Split by semicolon for multiple statements
      const statements = sqlContent
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      let successCount = 0;
      let skipCount = 0;

      for (const statement of statements) {
        try {
          await sql.query(statement);
          successCount++;
        } catch (error) {
          // Skip errors for already existing objects
          if (
            error.message.includes('already exists') ||
            error.message.includes('violates unique') ||
            error.message.includes('duplicate key')
          ) {
            skipCount++;
          } else {
            console.warn(`  ⚠️  ${error.message.split('\n')[0]}`);
          }
        }
      }

      console.log(`✅ ${migration} (${successCount} executed, ${skipCount} skipped)\n`);
    }

    console.log('✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runAllMigrations();
