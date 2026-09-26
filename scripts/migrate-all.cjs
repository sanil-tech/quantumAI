const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  console.log('🔄 Connecting to PostgreSQL at:', dbUrl.replace(/:[^:@]+@/, ':****@'));

  const pool = new Pool({ connectionString: dbUrl });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully!\n');

    const migrationsDir = path.resolve(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${files.length} migration scripts in migrations/:`);
    for (const file of files) {
      console.log(`   - ${file}`);
    }
    console.log('\n🚀 Executing migrations in sequential order...\n');

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      let sql = fs.readFileSync(filePath, 'utf-8');
      if (sql.charCodeAt(0) === 0xFEFF) {
        sql = sql.slice(1);
      }
      
      console.log(`⏳ Applying: ${file}...`);
      try {
        await client.query(sql);
        console.log(`✅ Success: ${file}`);
      } catch (err) {
        if (err.message && (err.message.includes('already exists') || err.message.includes('duplicate key'))) {
          console.log(`ℹ️ Notice: ${file} (Skipped existing objects: ${err.message.split('\n')[0]})`);
        } else {
          console.error(`❌ Error in ${file}:`, err.message);
          throw err;
        }
      }
    }

    console.log('\n🎉 ALL MIGRATIONS COMPLETED SUCCESSFULLY!\n');
    client.release();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
