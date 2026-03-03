import type { FastifyInstance } from 'fastify';
import { CreateAgentSchema, HeartbeatSchema } from '@mc/shared';
import * as agentDomain from '../domain/agents.js';
import { recordHeartbeat } from '../services/heartbeat.js';

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  // Register a new agent
  app.post('/agents', async (req, reply) => {
    const input = CreateAgentSchema.parse(req.body);
    const agent = await agentDomain.createAgent(input);
    return reply.status(201).send(agent);
  });

  // List all agents
  app.get('/agents', async (_req, reply) => {
    const agents = await agentDomain.listAgents();
    return reply.send(agents);
  });

  // Get a single agent
  app.get('/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await agentDomain.getAgent(id);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    return reply.send(agent);
  });

  // Record a heartbeat
  app.post('/agents/:id/heartbeat', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = HeartbeatSchema.parse(req.body ?? {});
    const result = await recordHeartbeat(id, input.sequence_id);

    if (!result.ok) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    return reply.send({ ok: true, duplicate: result.duplicate });
  });
}
