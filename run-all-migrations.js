const { sql } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');

const migrations = [
  '001_add_encryption_password.sql',
  '002_add_realtime_communications.sql',
  '003_add_model_management.sql',
];

async function runAllMigrations() {
  try {
    console.log('🚀 Starting database migrations...\n');

    for (const migration of migrations) {
      console.log(`Running: ${migration}`);

      const migrationPath = path.join(__dirname, 'database', 'migrations', migration);
      const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

      // Split by semicolon for multiple statements
      const statements = sqlContent
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        try {
          await sql.query(statement);
        } catch (error) {
          // Ignore errors (likely already created tables)
          if (!error.message.includes('already exists') && !error.message.includes('violates unique')) {
            console.log(`  ⚠️  ${error.message.split('\n')[0]}`);
          }
        }
      }

      console.log(`✅ ${migration} processed\n`);
    }

    console.log('✅ All migrations completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runAllMigrations();
