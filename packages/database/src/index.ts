import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { logger, config } from '@iati/core';
import * as schema from './schema';
import { TradingRepository } from './repository';

let pool: Pool | null = null;
let dbInstance: NodePgDatabase<typeof schema> | null = null;

export const getDbPool = (): Pool => {
  if (!pool) {
    if (!config.DATABASE_URL) {
      logger.warn('DATABASE_URL is not set. Using fallback PostgreSQL pool configuration.');
      pool = new Pool({
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'iati_trading',
        connectionTimeoutMillis: 2000,
      });
    } else {
      pool = new Pool({
        connectionString: config.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    }

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle PG client', err);
    });
  }
  return pool;
};

export const getDrizzleDb = (): NodePgDatabase<typeof schema> => {
  if (!dbInstance) {
    dbInstance = drizzle(getDbPool(), { schema });
  }
  return dbInstance;
};

export const checkDbConnection = async (): Promise<boolean> => {
  try {
    const p = getDbPool();
    const client = await p.connect();
    client.release();
    return true;
  } catch (err) {
    logger.error('Failed to connect to PostgreSQL database', err);
    return false;
  }
};

export * from './schema';
export * from './repository';
