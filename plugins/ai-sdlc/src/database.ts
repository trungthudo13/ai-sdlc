import { Pool, type PoolClient, type QueryResultRow } from "pg";

const pools = new Map<string, Pool>();

function getPool(connectionString: string): Pool {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "openclaw-ai-sdlc",
    });
    pools.set(connectionString, pool);
  }
  return pool;
}

export async function query<Row extends QueryResultRow>(
  connectionString: string,
  text: string,
  values: unknown[] = [],
): Promise<Row[]> {
  const result = await getPool(connectionString).query<Row>(text, values);
  return result.rows;
}

export async function transaction<T>(
  connectionString: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool(connectionString).connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
