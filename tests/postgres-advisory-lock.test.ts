import assert from "node:assert/strict";
import test from "node:test";
import {
  runWithPostgresAdvisoryLock,
  type PostgresAdvisoryLockClient,
} from "../src/persistence/postgres-advisory-lock.js";

interface RecordedQuery {
  queryText: string;
  values: readonly unknown[];
}

class FakePostgresAdvisoryLockClient implements PostgresAdvisoryLockClient {
  readonly queries: RecordedQuery[] = [];
  connectCount = 0;
  endCount = 0;

  constructor(private readonly lockAcquired: boolean) {}

  async connect(): Promise<void> {
    this.connectCount += 1;
  }

  async query<TResult extends Record<string, unknown>>(
    queryText: string,
    values: readonly unknown[],
  ): Promise<{ rows: TResult[] }> {
    this.queries.push({ queryText, values });

    if (queryText.includes("pg_try_advisory_lock")) {
      return {
        rows: [{ acquired: this.lockAcquired } as unknown as TResult],
      };
    }

    return {
      rows: [{ released: true } as unknown as TResult],
    };
  }

  async end(): Promise<void> {
    this.endCount += 1;
  }
}

const lockInput = {
  databaseUrl: "postgresql://example",
  namespaceId: 100,
  lockId: 200,
};

test("runs a job while holding a PostgreSQL advisory lock", async () => {
  const client = new FakePostgresAdvisoryLockClient(true);
  let jobCallCount = 0;

  const result = await runWithPostgresAdvisoryLock(
    lockInput,
    async () => {
      jobCallCount += 1;
      return "finished";
    },
    () => client,
  );

  assert.deepEqual(result, {
    acquired: true,
    result: "finished",
  });
  assert.equal(jobCallCount, 1);
  assert.equal(client.connectCount, 1);
  assert.equal(client.endCount, 1);
  assert.equal(client.queries.length, 2);
  assert.match(client.queries[0]!.queryText, /pg_try_advisory_lock/);
  assert.match(client.queries[1]!.queryText, /pg_advisory_unlock/);
  assert.deepEqual(client.queries[0]!.values, [100, 200]);
  assert.deepEqual(client.queries[1]!.values, [100, 200]);
});

test("skips the job when another process holds the advisory lock", async () => {
  const client = new FakePostgresAdvisoryLockClient(false);
  let jobCallCount = 0;

  const result = await runWithPostgresAdvisoryLock(
    lockInput,
    async () => {
      jobCallCount += 1;
    },
    () => client,
  );

  assert.deepEqual(result, {
    acquired: false,
  });
  assert.equal(jobCallCount, 0);
  assert.equal(client.endCount, 1);
  assert.equal(client.queries.length, 1);
});

test("releases the advisory lock when the job fails", async () => {
  const client = new FakePostgresAdvisoryLockClient(true);

  await assert.rejects(
    runWithPostgresAdvisoryLock(
      lockInput,
      async () => {
        throw new Error("Maintenance failed.");
      },
      () => client,
    ),
    /Maintenance failed\./,
  );

  assert.equal(client.endCount, 1);
  assert.equal(client.queries.length, 2);
  assert.match(client.queries[1]!.queryText, /pg_advisory_unlock/);
});
