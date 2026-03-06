import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

function equalsConstantTime(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function requireTelemetryAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const expected = process.env.CONTROL_API_TELEMETRY_TOKEN;
  if (!expected) {
    return reply.status(503).send({ error: 'Telemetry token is not configured' });
  }

  const authorization = request.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' });
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return reply.status(401).send({ error: 'Missing bearer token' });
  }

  if (!equalsConstantTime(token, expected)) {
    return reply.status(403).send({ error: 'Invalid bearer token' });
  }
}
