import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerCorrelationMiddleware } from '../middleware/correlation.js';

describe('correlation ID middleware', () => {
  it('generates a correlation ID when not provided', async () => {
    const app = Fastify();
    await registerCorrelationMiddleware(app);

    app.get('/test', async (req) => ({
      correlationId: req.correlationId
    }));

    const res = await app.inject({ method: 'GET', url: '/test' });
    const body = res.json() as { correlationId: string };

    // Should have a UUID correlation ID
    expect(body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    // Should be in the response header
    expect(res.headers['x-correlation-id']).toBe(body.correlationId);

    await app.close();
  });

  it('propagates existing correlation ID', async () => {
    const app = Fastify();
    await registerCorrelationMiddleware(app);

    app.get('/test', async (req) => ({
      correlationId: req.correlationId
    }));

    const existingId = 'my-custom-correlation-id';
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-correlation-id': existingId }
    });

    const body = res.json() as { correlationId: string };
    expect(body.correlationId).toBe(existingId);
    expect(res.headers['x-correlation-id']).toBe(existingId);

    await app.close();
  });

  it('generates different IDs for different requests', async () => {
    const app = Fastify();
    await registerCorrelationMiddleware(app);

    app.get('/test', async (req) => ({
      correlationId: req.correlationId
    }));

    const res1 = await app.inject({ method: 'GET', url: '/test' });
    const res2 = await app.inject({ method: 'GET', url: '/test' });

    const id1 = (res1.json() as { correlationId: string }).correlationId;
    const id2 = (res2.json() as { correlationId: string }).correlationId;

    expect(id1).not.toBe(id2);

    await app.close();
  });

  it('ignores empty string correlation ID and generates a new one', async () => {
    const app = Fastify();
    await registerCorrelationMiddleware(app);

    app.get('/test', async (req) => ({
      correlationId: req.correlationId
    }));

    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-correlation-id': '' }
    });

    const body = res.json() as { correlationId: string };
    expect(body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    await app.close();
  });
});
