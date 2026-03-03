import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { redis } from '../services/redis.js';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

interface CachedResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Idempotency middleware.
 * On write requests (POST, PATCH, PUT, DELETE), checks for an `Idempotency-Key` header.
 * If the key was already seen (within 24h), returns the cached response.
 * Otherwise, executes the handler and caches the response for future replays.
 */
export async function registerIdempotencyMiddleware(app: FastifyInstance): Promise<void> {
  // Hook into the request lifecycle
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!WRITE_METHODS.has(request.method)) return;

    const idempotencyKey = request.headers['idempotency-key'];
    if (!idempotencyKey || typeof idempotencyKey !== 'string') return;

    const redisKey = `idem:${idempotencyKey}`;
    const cached = await redis.get(redisKey);

    if (cached) {
      const parsed = JSON.parse(cached) as CachedResponse;
      reply.status(parsed.statusCode).send(parsed.body);
      return reply; // Short-circuit
    }

    // Store the key on the request for the onSend hook
    (request as FastifyRequest & { idempotencyRedisKey?: string }).idempotencyRedisKey = redisKey;
  });

  // Cache the response after it's sent
  app.addHook(
    'onSend',
    async (request: FastifyRequest, reply: FastifyReply, payload: string | Buffer | null) => {
      const req = request as FastifyRequest & { idempotencyRedisKey?: string };
      if (!req.idempotencyRedisKey) return payload;

      // Only cache successful responses (2xx)
      const statusCode = reply.statusCode;
      if (statusCode < 200 || statusCode >= 300) return payload;

      let body: unknown;
      try {
        body = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch {
        body = payload;
      }

      const cached: CachedResponse = { statusCode, body };
      await redis.set(
        req.idempotencyRedisKey,
        JSON.stringify(cached),
        'EX',
        IDEMPOTENCY_TTL_SECONDS,
      );

      return payload;
    },
  );
}
