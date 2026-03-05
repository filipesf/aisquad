import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { agentRoutes } from './routes/agents.js';
import { taskRoutes } from './routes/tasks.js';
import { assignmentRoutes } from './routes/assignments.js';
import { commentRoutes } from './routes/comments.js';
import { notificationRoutes } from './routes/notifications.js';
import { activityRoutes } from './routes/activities.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { registerCorrelationMiddleware } from './middleware/correlation.js';
import { registerIdempotencyMiddleware } from './middleware/idempotency.js';
import { redis } from './services/redis.js';
import { close as closeDb } from './services/db.js';
import { close as closeRedis } from './services/redis.js';

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
});

// CORS
await app.register(cors, {
  origin: true,
  credentials: true,
});

// Middleware
await registerCorrelationMiddleware(app);
await registerIdempotencyMiddleware(app);

// Register routes
await app.register(healthRoutes);
await app.register(agentRoutes);
await app.register(taskRoutes);
await app.register(assignmentRoutes);
await app.register(commentRoutes);
await app.register(notificationRoutes);
await app.register(activityRoutes);
await app.register(telemetryRoutes);

// Graceful shutdown
const shutdown = async () => {
  app.log.info('Shutting down...');
  await app.close();
  await closeDb();
  await closeRedis();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Connect Redis eagerly so health check works
await redis.connect();

// Start server
const host = process.env['HOST'] ?? '0.0.0.0';
const port = Number(process.env['PORT'] ?? 3000);

await app.listen({ host, port });
app.log.info(`Control API listening on ${host}:${port}`);
