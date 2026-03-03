// Integration test setup — shared utilities for integration tests
export const TEST_DB = {
  host: process.env['PGHOST'] ?? 'localhost',
  port: Number(process.env['PGPORT'] ?? 5432),
  user: process.env['PGUSER'] ?? 'postgres',
  password: process.env['PGPASSWORD'] ?? 'postgres',
  database: process.env['PGDATABASE'] ?? 'mission_control',
};

export const TEST_REDIS = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
};
