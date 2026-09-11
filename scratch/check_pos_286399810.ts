import 'dotenv/config';
import { Pool } from 'pg';

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    const res = await pool.query(`
      SELECT *
      FROM positions
      ORDER BY opened_at DESC
      LIMIT 10
    `);
    console.log("Recent positions in DB:");
    console.table(res.rows.map(r => ({
      id: r.position_id,
      sym: r.symbol,
      dir: r.direction,
      qty: r.quantity,
      entry: r.entry_price,
      status: r.status,
      opened: r.opened_at,
      raw: JSON.stringify(r).substring(0, 80)
    })));

    const match = await pool.query(`
      SELECT * FROM positions
      WHERE position_id LIKE '%286399810%'
    `);
    console.log("Position 286399810 details:", match.rows);
  } catch (e: any) {
    console.error("DB error:", e.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}
run();
