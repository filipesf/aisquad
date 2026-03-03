import { Redis } from 'ioredis';

const redis = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export async function healthCheck(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function close(): Promise<void> {
  await redis.quit();
}

export { redis };
