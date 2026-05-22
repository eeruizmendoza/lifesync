#!/usr/bin/env node

/**
 * Run Migration 024: Add API Service Tables
 *
 * Usage: node scripts/run-migration-024.js
 */

const fs = require('fs');
const path = require('path');
const { sql } = require('@vercel/postgres');

async function runMigration() {
  try {
    console.log('🚀 Starting Migration 024: Add API Service Tables...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/024_add_api_service_tables.sql');
    let migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Remove comments
    migrationSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    // Split by semicolon, but preserve complete statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let skipCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      const statementNum = i + 1;

      // Extract statement name for logging
      const match = statement.match(/CREATE\s+(?:(?:TABLE|INDEX|UNIQUE\s+INDEX)\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      const objectName = match ? match[1] : `Statement ${statementNum}`;

      try {
        process.stdout.write(`  [${statementNum}/${statements.length}] ${objectName}... `);

        await sql.query(statement);

        console.log('✅');
        successCount++;
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists') || error.message.includes('UNIQUE constraint') || error.code === '42P07') {
          console.log('⚠️  (already exists)');
          skipCount++;
        } else {
          console.log(`❌ Failed`);
          console.error(`  Error: ${error.message}\n`);
          throw error;
        }
      }
    }

    console.log(`\n✅ Migration 024 completed!\n`);
    console.log(`📊 Summary:`);
    console.log(`  - Created: ${successCount}`);
    console.log(`  - Skipped: ${skipCount}`);
    console.log(`\n📊 Objects created/updated:`);
    console.log(`  - translation_cache (with indexes)`);
    console.log(`  - tts_logs (with indexes)`);
    console.log(`  - transcription_logs (with indexes)`);
    console.log(`  - provider_health_status (with indexes)`);
    console.log(`  - api_usage_quotas (with indexes)\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
runMigration();
