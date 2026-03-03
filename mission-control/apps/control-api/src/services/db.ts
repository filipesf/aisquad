import pg from 'pg';

const pool = new pg.Pool({
  host: process.env['PGHOST'] ?? 'localhost',
  port: Number(process.env['PGPORT'] ?? 5432),
  user: process.env['PGUSER'] ?? 'postgres',
  password: process.env['PGPASSWORD'] ?? 'postgres',
  database: process.env['PGDATABASE'] ?? 'mission_control',
  max: 20,
});

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

export async function close(): Promise<void> {
  await pool.end();
}

export { pool };
