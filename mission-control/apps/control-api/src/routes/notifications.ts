import type { FastifyInstance } from 'fastify';
import * as agentDomain from '../domain/agents.js';
import * as notificationDomain from '../domain/notifications.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // List notifications for an agent (undelivered + recent delivered)
  app.get('/agents/:id/notifications', async (req, reply) => {
    const { id: agentId } = req.params as { id: string };

    const agent = await agentDomain.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    const notifications = await notificationDomain.listForAgent(agentId);
    return reply.send(notifications);
  });

  // Acknowledge a notification
  app.post('/notifications/:id/ack', async (req, reply) => {
    const { id } = req.params as { id: string };

    const notification = await notificationDomain.acknowledge(id);
    if (!notification) {
      return reply.status(404).send({ error: 'Notification not found' });
    }

    return reply.send(notification);
  });
}
