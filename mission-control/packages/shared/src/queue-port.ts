/**
 * QueuePort - abstraction over event transport.
 * v1 uses Redis Streams. Future: NATS or Temporal.
 */
export interface QueueMessage<T = unknown> {
  id: string;
  stream: string;
  data: T;
  timestamp: number;
}

export interface QueuePort {
  /** Publish a message to a stream */
  publish(stream: string, data: unknown): Promise<string>;

  /** Subscribe to a stream with a consumer group */
  subscribe(
    stream: string,
    group: string,
    consumer: string,
    handler: (msg: QueueMessage) => Promise<void>
  ): Promise<void>;

  /** Acknowledge a message as processed */
  ack(stream: string, group: string, messageId: string): Promise<void>;

  /** Graceful shutdown */
  close(): Promise<void>;
}
