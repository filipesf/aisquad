import type { FastifyInstance } from 'fastify';
import * as assignmentDomain from '../domain/assignments.js';

export async function assignmentRoutes(app: FastifyInstance): Promise<void> {
  // Accept an offered assignment
  app.post('/assignments/:id/accept', async (req, reply) => {
    const { id } = req.params as { id: string };
    const assignment = await assignmentDomain.accept(id);

    if (!assignment) {
      return reply.status(404).send({
        error: 'Assignment not found or not in offered state',
      });
    }

    return reply.send(assignment);
  });

  // Complete an accepted assignment
  app.post('/assignments/:id/complete', async (req, reply) => {
    const { id } = req.params as { id: string };
    const assignment = await assignmentDomain.complete(id);

    if (!assignment) {
      return reply.status(404).send({
        error: 'Assignment not found or not in accepted state',
      });
    }

    return reply.send(assignment);
  });

  // Get an assignment by ID
  app.get('/assignments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const assignment = await assignmentDomain.getAssignment(id);

    if (!assignment) {
      return reply.status(404).send({ error: 'Assignment not found' });
    }

    return reply.send(assignment);
  });

  // List assignment history for a task
  app.get('/tasks/:id/assignments', async (req, reply) => {
    const { id: taskId } = req.params as { id: string };
    const assignments = await assignmentDomain.listForTask(taskId);
    return reply.send(assignments);
  });

  // List active assignments for an agent
  app.get('/agents/:id/assignments', async (req, reply) => {
    const { id: agentId } = req.params as { id: string };
    const assignments = await assignmentDomain.listActiveForAgent(agentId);
    return reply.send(assignments);
  });
}
