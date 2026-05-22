const { sql } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');

// Ensure env vars are loaded
require('dotenv').config({ path: '.env.local' });

const schemaOrder = [
  { name: 'Base Schema', file: 'database/schema.sql' },
  { name: 'Migration 001', file: 'database/migrations/001_add_encryption_password.sql' },
  { name: 'Migration 002', file: 'database/migrations/002_add_realtime_communications.sql' },
  { name: 'Migration 003', file: 'database/migrations/003_add_model_management.sql' },
];

async function applySchema() {
  try {
    console.log('🚀 Starting schema application...\n');

    for (const { name, file } of schemaOrder) {
      console.log(`📋 Applying: ${name}`);

      const filePath = path.join(__dirname, file);
      let sqlContent = fs.readFileSync(filePath, 'utf-8');

      // Remove comments and empty lines for cleaner execution
      const lines = sqlContent
        .split('\n')
        .filter((line) => {
          const trimmed = line.trim();
          // Keep non-comment, non-empty lines
          return trimmed && !trimmed.startsWith('--') && !trimmed.startsWith('/**') && !trimmed.startsWith('*');
        })
        .join('\n');

      // Split by semicolon for individual statements
      const statements = lines
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      for (const statement of statements) {
        try {
          // Skip complex statements that might have syntax issues
          if (statement.includes('COMMENT ON') && statement.includes("''")) {
            // Handle escaped quotes in comments
            const fixed = statement.replace(/'' /g, "' ");
            await sql.query(fixed);
          } else {
            await sql.query(statement);
          }
          successCount++;
        } catch (error) {
          const msg = error.message || '';

          // Skip expected errors
          if (
            msg.includes('already exists') ||
            msg.includes('duplicate key') ||
            msg.includes('violates unique') ||
            msg.includes('already been created') ||
            msg.includes('relation') ||
            msg.includes('does not exist')
          ) {
            skipCount++;
          } else {
            console.warn(`  ⚠️  [${successCount + skipCount + errorCount}] ${msg.split('\n')[0]}`);
            errorCount++;
          }
        }
      }

      const total = successCount + skipCount + errorCount;
      console.log(`✅ ${name} (${successCount}/${total} executed)\n`);
    }

    // Verify key tables exist
    console.log('📊 Verifying schema...');
    const tables = ['users', 'conversations', 'conversation_recordings', 'conversation_transcripts', 'model_config'];

    for (const table of tables) {
      try {
        const result = await sql.query(
          `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`,
          [table]
        );
        const exists = result.rows[0].exists;
        console.log(`  ${exists ? '✓' : '✗'} ${table}`);
      } catch (error) {
        console.log(`  ? ${table} (check failed)`);
      }
    }

    console.log('\n✅ Schema application completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Schema application failed:', error.message);
    process.exit(1);
  }
}

applySchema();
