const { Client } = require('pg');

const connectionString = "postgresql://neondb_owner:npg_QJ14DAZo5hYx@ep-square-hill-anl7eq8v-pooler.c-6.us-east-1.aws.neon.tech/lifesync?sslmode=require&channel_binding=require";

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await client.connect();
    console.log('✅ Database connection successful\n');
    
    const versionResult = await client.query('SELECT version()');
    console.log('PostgreSQL Version:', versionResult.rows[0].version.split(' on ')[0]);
    
    const tablesResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log('\n✅ Tables in lifesync database (' + tablesResult.rows.length + ' total):');
    tablesResult.rows.forEach(row => console.log('  -', row.table_name));
    
    // Check schema_version table for migration status
    const migrationCheck = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_version')"
    );
    
    if (migrationCheck.rows[0].exists) {
      const migrations = await client.query('SELECT * FROM schema_version ORDER BY version DESC LIMIT 5');
      console.log('\n✅ Recent migrations:');
      migrations.rows.forEach(row => {
        console.log(`  - v${row.version}: ${row.description} (${new Date(row.installed_on).toISOString()})`);
      });
    }
    
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Database error:', err.message);
    process.exit(1);
  }
})();
