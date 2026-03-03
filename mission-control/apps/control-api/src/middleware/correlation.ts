import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Correlation ID middleware.
 * Generates or propagates a correlation ID through all API requests.
 * The correlation ID is available on the request via `request.correlationId`.
 * It is also returned in the response headers.
 */
export async function registerCorrelationMiddleware(app: FastifyInstance): Promise<void> {
  // Decorate request so TypeScript knows about correlationId
  app.decorateRequest('correlationId', '');

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const existing = request.headers[CORRELATION_HEADER];
    const correlationId = typeof existing === 'string' && existing.length > 0
      ? existing
      : randomUUID();

    (request as FastifyRequest & { correlationId: string }).correlationId = correlationId;
    void reply.header(CORRELATION_HEADER, correlationId);
  });
}

// Augment Fastify types so `request.correlationId` is typed
declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}
