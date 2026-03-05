import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IngestTelemetryBatchSchema } from '@mc/shared';
import * as telemetryDomain from '../domain/telemetry.js';
import { requireTelemetryAuth } from '../middleware/telemetry-auth.js';

const TelemetrySummaryQuerySchema = z.object({
  window: z.enum(['1h', '6h', '24h', '7d']).default('24h'),
  group_by: z.enum(['provider', 'model', 'agent', 'event_type', 'channel']).default('provider'),
});

const WINDOW_TO_MS: Record<z.infer<typeof TelemetrySummaryQuerySchema>['window'], number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export async function telemetryRoutes(app: FastifyInstance): Promise<void> {
  app.post('/telemetry/batch', { preHandler: requireTelemetryAuth }, async (req, reply) => {
    const parsed = IngestTelemetryBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid telemetry batch payload',
        details: parsed.error.flatten(),
      });
    }

    const result = await telemetryDomain.ingestBatch(parsed.data.events);
    return reply.status(201).send({ inserted: result.inserted });
  });

  app.get('/telemetry/summary', { preHandler: requireTelemetryAuth }, async (req, reply) => {
    const parsed = TelemetrySummaryQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid telemetry summary query',
        details: parsed.error.flatten(),
      });
    }

    const { window, group_by: groupBy } = parsed.data;
    const since = new Date(Date.now() - WINDOW_TO_MS[window]).toISOString();
    const summary = await telemetryDomain.getSummary({ since, window, groupBy });
    return reply.send(summary);
  });
}
