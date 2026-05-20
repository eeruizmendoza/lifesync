import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  const client = await pool.connect();
  const result = await client.query('SELECT version()');
  console.log('✅ Neon connection successful');
  console.log('PostgreSQL:', result.rows[0].version.split(' on ')[0]);
  
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  
  console.log('\n✅ Tables in lifesync database (' + tables.rows.length + ' total):');
  tables.rows.forEach(row => console.log('  -', row.table_name));
  
  client.release();
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error('❌ Connection failed:', err.message);
  if (err.code) console.error('   Code:', err.code);
  process.exit(1);
}
