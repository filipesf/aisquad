import type { FastifyInstance } from 'fastify';
import * as activityDomain from '../domain/activities.js';

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  // List recent activities
  app.get('/activities', async (req, reply) => {
    const { limit } = req.query as { limit?: string };
    const max = limit ? Math.min(Number(limit), 200) : 50;
    const activities = await activityDomain.listRecent(max);
    return reply.send(activities);
  });

  // SSE stream for real-time activity updates
  app.get('/activities/stream', async (req, reply) => {
    const abortController = new AbortController();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial ping
    reply.raw.write('event: ping\ndata: {"time":"' + new Date().toISOString() + '"}\n\n');

    // Poll for new activities every 2 seconds
    let lastId = '';
    const recent = await activityDomain.listRecent(1);
    if (recent.length > 0) {
      lastId = recent[0]!.id;
    }

    const interval = setInterval(async () => {
      if (abortController.signal.aborted) return;
      try {
        const activities = await activityDomain.listSince(lastId);
        for (const activity of activities) {
          reply.raw.write(
            `event: activity\ndata: ${JSON.stringify(activity)}\n\n`,
          );
          lastId = activity.id;
        }
      } catch {
        // Connection might be closed
      }
    }, 2000);

    // Cleanup on close
    req.raw.on('close', () => {
      abortController.abort();
      clearInterval(interval);
    });

    // Don't let Fastify close the reply
    await reply.hijack();
  });
}
