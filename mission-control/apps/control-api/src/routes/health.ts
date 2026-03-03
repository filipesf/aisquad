import type { FastifyInstance } from 'fastify';
import { healthCheck as dbHealth } from '../services/db.js';
import { healthCheck as redisHealth } from '../services/redis.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    const [db, redis] = await Promise.all([dbHealth(), redisHealth()]);

    const status = db && redis ? 'ok' : 'degraded';
    const code = db && redis ? 200 : 503;

    return reply.status(code).send({ status, db, redis });
  });
}
