import { db } from '@vercel/postgres';

try {
  const result = await db.query('SELECT version()');
  console.log('✅ Database connection successful');
  console.log('PostgreSQL:', result.rows[0].version.split(' on ')[0]);
  
  const tables = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  
  console.log('\n✅ Tables in lifesync database (' + tables.rows.length + ' total):');
  tables.rows.forEach(row => console.log('  -', row.table_name));
  
  process.exit(0);
} catch (err) {
  console.error('❌ Database error:', err.message);
  process.exit(1);
}
