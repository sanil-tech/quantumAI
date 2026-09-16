import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/quantumai';
  console.log('🔄 Connecting to PostgreSQL at:', dbUrl.replace(/:[^:@]+@/, ':****@'));

  const pool = new Pool({ connectionString: dbUrl });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully!\n');

    const migrationsDir = path.resolve(process.cwd(), 'migrations');
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
      } catch (err: any) {
        // Some migrations might already have tables or types created, log and continue if benign
        if (err.message?.includes('already exists')) {
          console.log(`ℹ️ Notice: ${file} (Skipped existing objects: ${err.message.split('\n')[0]})`);
        } else {
          console.error(`❌ Error in ${file}:`, err.message);
          throw err;
        }
      }
    }

    console.log('\n🎉 ALL MIGRATIONS COMPLETED SUCCESSFULLY!\n');
    client.release();
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
