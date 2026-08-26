const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.hfvbyktusslocxsblenu:tGHjHzbNBDf4ovr7@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Get generated column definition
  const genCol = await client.query(`
    SELECT column_name, generation_expression, is_generated
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_current'
      AND is_generated = 'ALWAYS'
  `);
  console.log('=== GENERATED COLUMNS ===');
  console.log(JSON.stringify(genCol.rows, null, 2));

  // Get full DDL of all columns with their defaults
  const cols = await client.query(`
    SELECT 
      a.attname AS column_name,
      pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
      a.attgenerated
    FROM pg_attribute a
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'inventory_current'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `);
  console.log('\n=== ALL COLUMNS WITH EXPRESSIONS ===');
  console.log(JSON.stringify(cols.rows, null, 2));

  await client.end();
}

run().catch(e => { console.error(e.message); client.end(); });
