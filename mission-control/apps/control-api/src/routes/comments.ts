import { CreateCommentSchema } from '@mc/shared';
import type { FastifyInstance } from 'fastify';
import * as agentDomain from '../domain/agents.js';
import * as commentDomain from '../domain/comments.js';
import * as taskDomain from '../domain/tasks.js';

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  // Post a comment on a task
  app.post('/tasks/:id/comments', async (req, reply) => {
    const { id: taskId } = req.params as { id: string };
    const { author_id: authorId } = req.query as { author_id?: string };

    if (!authorId) {
      return reply.status(400).send({ error: 'author_id query parameter is required' });
    }

    // Verify task exists
    const task = await taskDomain.getTask(taskId);
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    // Verify author exists
    const author = await agentDomain.getAgent(authorId);
    if (!author) {
      return reply.status(404).send({ error: 'Author agent not found' });
    }

    const input = CreateCommentSchema.parse(req.body);
    const comment = await commentDomain.createComment(taskId, authorId, input);
    return reply.status(201).send(comment);
  });

  // List comments for a task
  app.get('/tasks/:id/comments', async (req, reply) => {
    const { id: taskId } = req.params as { id: string };

    const task = await taskDomain.getTask(taskId);
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    const comments = await commentDomain.listComments(taskId);
    return reply.send(comments);
  });
}
