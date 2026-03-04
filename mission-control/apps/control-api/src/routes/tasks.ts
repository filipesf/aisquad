import type { FastifyInstance } from 'fastify';
import { CreateTaskSchema, TaskState } from '@mc/shared';
import * as taskDomain from '../domain/tasks.js';
import { InvalidTransitionError } from '../domain/tasks.js';
import * as assignmentDomain from '../domain/assignments.js';

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  // Create a task
  app.post('/tasks', async (req, reply) => {
    const input = CreateTaskSchema.parse(req.body);
    const task = await taskDomain.createTask(input);
    return reply.status(201).send(task);
  });

  // List tasks (optionally filter by state)
  app.get('/tasks', async (req, reply) => {
    const { state } = req.query as { state?: string };
    const tasks = await taskDomain.listTasks(state);
    return reply.send(tasks);
  });

  // Get a single task with current assignment
  app.get('/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await taskDomain.getTask(id);
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    const assignment = await assignmentDomain.getActiveForTask(id);
    return reply.send({ ...task, current_assignment: assignment });
  });

  // Delete a task
  app.delete('/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await taskDomain.deleteTask(id);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });

  // Advance task state
  app.patch('/tasks/:id/state', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { state } = req.body as { state?: string };

    if (!state) {
      return reply.status(400).send({ error: 'state is required' });
    }

    const parsed = TaskState.safeParse(state);
    if (!parsed.success) {
      return reply.status(400).send({ error: `Invalid state: ${state}` });
    }

    try {
      const task = await taskDomain.transitionState(id, parsed.data);
      return reply.send(task);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return reply.status(422).send({ error: err.message });
      }
      if (err instanceof Error && err.message.includes('not found')) {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });
}
