import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerIdempotencyMiddleware } from '../middleware/idempotency.js';

// Mock Redis
const mockRedisStore = new Map<string, string>();

vi.mock('../services/redis.js', () => ({
  redis: {
    get: vi.fn(async (key: string) => mockRedisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
      mockRedisStore.set(key, value);
      return 'OK';
    }),
  },
}));

describe('idempotency middleware', () => {
  beforeEach(() => {
    mockRedisStore.clear();
    vi.clearAllMocks();
  });

  it('passes through GET requests without idempotency key', async () => {
    const app = Fastify();
    await registerIdempotencyMiddleware(app);

    app.get('/test', async () => ({ hello: 'world' }));

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ hello: 'world' });

    await app.close();
  });

  it('passes through POST requests without idempotency key', async () => {
    let callCount = 0;
    const app = Fastify();
    await registerIdempotencyMiddleware(app);

    app.post('/test', async () => {
      callCount++;
      return { count: callCount };
    });

    const res1 = await app.inject({
      method: 'POST',
      url: '/test',
      payload: { data: 'test' },
    });
    expect(res1.statusCode).toBe(200);
    expect(callCount).toBe(1);

    const res2 = await app.inject({
      method: 'POST',
      url: '/test',
      payload: { data: 'test' },
    });
    expect(res2.statusCode).toBe(200);
    expect(callCount).toBe(2); // Handler called twice (no idempotency key)

    await app.close();
  });

  it('returns cached response for duplicate POST with same idempotency key', async () => {
    let callCount = 0;
    const app = Fastify();
    await registerIdempotencyMiddleware(app);

    app.post('/test', async () => {
      callCount++;
      return { count: callCount };
    });

    // First request
    const res1 = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'Idempotency-Key': 'key-1' },
      payload: { data: 'test' },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json()).toEqual({ count: 1 });
    expect(callCount).toBe(1);

    // Second request with same key — should return cached
    const res2 = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'Idempotency-Key': 'key-1' },
      payload: { data: 'different' },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual({ count: 1 }); // Same response
    expect(callCount).toBe(1); // Handler not called again

    await app.close();
  });

  it('different idempotency keys produce different results', async () => {
    let callCount = 0;
    const app = Fastify();
    await registerIdempotencyMiddleware(app);

    app.post('/test', async () => {
      callCount++;
      return { count: callCount };
    });

    const res1 = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'Idempotency-Key': 'key-1' },
    });
    expect(res1.json()).toEqual({ count: 1 });

    const res2 = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'Idempotency-Key': 'key-2' },
    });
    expect(res2.json()).toEqual({ count: 2 });
    expect(callCount).toBe(2);

    await app.close();
  });

  it('does not cache error responses', async () => {
    let callCount = 0;
    const app = Fastify();
    await registerIdempotencyMiddleware(app);

    app.post('/test', async (_req, reply) => {
      callCount++;
      if (callCount === 1) {
        return reply.status(500).send({ error: 'server error' });
      }
      return { success: true };
    });

    // First request fails
    const res1 = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'Idempotency-Key': 'error-key' },
    });
    expect(res1.statusCode).toBe(500);

    // Second request with same key — should retry (not cached)
    const res2 = await app.inject({
      method: 'POST',
      url: '/test',
      headers: { 'Idempotency-Key': 'error-key' },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual({ success: true });
    expect(callCount).toBe(2);

    await app.close();
  });

  it('works with PATCH method', async () => {
    let callCount = 0;
    const app = Fastify();
    await registerIdempotencyMiddleware(app);

    app.patch('/test', async () => {
      callCount++;
      return { patched: callCount };
    });

    const res1 = await app.inject({
      method: 'PATCH',
      url: '/test',
      headers: { 'Idempotency-Key': 'patch-key' },
    });
    expect(res1.json()).toEqual({ patched: 1 });

    const res2 = await app.inject({
      method: 'PATCH',
      url: '/test',
      headers: { 'Idempotency-Key': 'patch-key' },
    });
    expect(res2.json()).toEqual({ patched: 1 }); // Cached
    expect(callCount).toBe(1);

    await app.close();
  });
});
