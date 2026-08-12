import { createClient, RedisClientType } from 'redis';
import { logger, config } from '@iati/core';

let client: RedisClientType | null = null;

export const getCacheClient = async (): Promise<RedisClientType> => {
  if (!client) {
    if (!config.REDIS_URL) {
      logger.warn('REDIS_URL is not set. Creating an unconnected redis client.');
      client = createClient() as RedisClientType;
    } else {
      client = createClient({
        url: config.REDIS_URL,
      }) as RedisClientType;

      client.on('error', (err) => {
        logger.error('Redis Client Error', err);
      });

      await client.connect();
      logger.info('Connected to Redis');
    }
  }
  return client;
};

export interface ICacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export class RedisCacheService implements ICacheService {
  async get(key: string): Promise<string | null> {
    const c = await getCacheClient();
    return c.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const c = await getCacheClient();
    if (ttlSeconds) {
      await c.setEx(key, ttlSeconds, value);
    } else {
      await c.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    const c = await getCacheClient();
    await c.del(key);
  }
}
