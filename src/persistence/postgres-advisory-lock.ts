import { Client, type ClientConfig } from "pg";

export interface PostgresAdvisoryLockClient {
  connect(): Promise<void>;
  query<TResult extends Record<string, unknown>>(
    queryText: string,
    values: readonly unknown[],
  ): Promise<{ rows: TResult[] }>;
  end(): Promise<void>;
}

export interface RunWithPostgresAdvisoryLockInput {
  databaseUrl: string;
  namespaceId: number;
  lockId: number;
}

export interface RunWithPostgresAdvisoryLockResult<TResult> {
  acquired: boolean;
  result?: TResult;
}

export type CreatePostgresAdvisoryLockClient = (
  config: ClientConfig,
) => PostgresAdvisoryLockClient;

const TRY_LOCK_QUERY =
  "SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired";
const UNLOCK_QUERY =
  "SELECT pg_advisory_unlock($1::integer, $2::integer) AS released";

function createPostgresAdvisoryLockClient(
  config: ClientConfig,
): PostgresAdvisoryLockClient {
  const client = new Client(config);

  return {
    connect: async () => {
      await client.connect();
    },
    query: async <TResult extends Record<string, unknown>>(
      queryText: string,
      values: readonly unknown[],
    ) => client.query<TResult>(queryText, [...values]),
    end: async () => {
      await client.end();
    },
  };
}

export async function runWithPostgresAdvisoryLock<TResult>(
  input: RunWithPostgresAdvisoryLockInput,
  jobFn: () => Promise<TResult>,
  createClientFn: CreatePostgresAdvisoryLockClient =
    createPostgresAdvisoryLockClient,
): Promise<RunWithPostgresAdvisoryLockResult<TResult>> {
  const client = createClientFn({
    connectionString: input.databaseUrl,
  });
  let acquired = false;

  await client.connect();

  try {
    const lockResult = await client.query<{ acquired: boolean }>(
      TRY_LOCK_QUERY,
      [input.namespaceId, input.lockId],
    );
    acquired = lockResult.rows[0]?.acquired === true;

    if (!acquired) {
      return {
        acquired: false,
      };
    }

    return {
      acquired: true,
      result: await jobFn(),
    };
  } finally {
    try {
      if (acquired) {
        await client.query<{ released: boolean }>(UNLOCK_QUERY, [
          input.namespaceId,
          input.lockId,
        ]);
      }
    } finally {
      await client.end();
    }
  }
}
