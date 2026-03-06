import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIdempotencyMiddleware } from '../middleware/idempotency.js';
import { telemetryRoutes } from '../routes/telemetry.js';

const mockRedisStore = new Map<string, string>();
const ingestBatchMock = vi.fn();
const getSummaryMock = vi.fn();

vi.mock('../services/redis.js', () => ({
  redis: {
    get: vi.fn(async (key: string) => mockRedisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
      mockRedisStore.set(key, value);
      return 'OK';
    })
  }
}));

vi.mock('../domain/telemetry.js', () => ({
  ingestBatch: (...args: unknown[]) => ingestBatchMock(...args),
  getSummary: (...args: unknown[]) => getSummaryMock(...args)
}));

describe('telemetry routes', () => {
  const previousToken = process.env.CONTROL_API_TELEMETRY_TOKEN;

  beforeEach(() => {
    mockRedisStore.clear();
    ingestBatchMock.mockReset();
    getSummaryMock.mockReset();
    process.env.CONTROL_API_TELEMETRY_TOKEN = 'test-telemetry-token';

    ingestBatchMock.mockResolvedValue({ inserted: 1 });
    getSummaryMock.mockResolvedValue({
      window: '1h',
      group_by: 'provider',
      since: new Date().toISOString(),
      generated_at: new Date().toISOString(),
      totals: {
        events: 1,
        tokens_total: 123,
        cost_usd: 0.12,
        avg_duration_ms: 80,
        min_duration_ms: 80,
        max_duration_ms: 80
      },
      groups: []
    });
  });

  afterEach(() => {
    if (previousToken === undefined) {
      delete process.env.CONTROL_API_TELEMETRY_TOKEN;
    } else {
      process.env.CONTROL_API_TELEMETRY_TOKEN = previousToken;
    }
  });

  async function buildApp({ withIdempotency = false }: { withIdempotency?: boolean } = {}) {
    const app = Fastify();
    if (withIdempotency) {
      await registerIdempotencyMiddleware(app);
    }
    await app.register(telemetryRoutes);
    return app;
  }

  const samplePayload = {
    events: [
      {
        event_type: 'model.usage',
        provider: 'openai',
        model: 'gpt-5.1',
        tokens_input: 100,
        tokens_output: 50,
        tokens_total: 150,
        payload: { run_id: 'r1' }
      }
    ]
  };

  it('returns 401 when bearer token is missing', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/telemetry/batch',
      payload: samplePayload
    });

    expect(response.statusCode).toBe(401);
    expect(ingestBatchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 403 when bearer token is invalid', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/telemetry/batch',
      headers: {
        Authorization: 'Bearer invalid-token'
      },
      payload: samplePayload
    });

    expect(response.statusCode).toBe(403);
    expect(ingestBatchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 503 when telemetry token config is missing', async () => {
    delete process.env.CONTROL_API_TELEMETRY_TOKEN;
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/telemetry/batch',
      headers: {
        Authorization: 'Bearer any-token'
      },
      payload: samplePayload
    });

    expect(response.statusCode).toBe(503);
    expect(ingestBatchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 201 with valid bearer token and payload', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/telemetry/batch',
      headers: {
        Authorization: 'Bearer test-telemetry-token'
      },
      payload: samplePayload
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ inserted: 1 });
    expect(ingestBatchMock).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('caches duplicate ingest requests with Idempotency-Key', async () => {
    const app = await buildApp({ withIdempotency: true });

    const request = {
      method: 'POST' as const,
      url: '/telemetry/batch',
      headers: {
        Authorization: 'Bearer test-telemetry-token',
        'Idempotency-Key': 'telemetry-key-1'
      },
      payload: samplePayload
    };

    const first = await app.inject(request);
    const second = await app.inject(request);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(ingestBatchMock).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns grouped summary for valid auth and query', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/telemetry/summary?window=1h&group_by=model',
      headers: {
        Authorization: 'Bearer test-telemetry-token'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(getSummaryMock).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
