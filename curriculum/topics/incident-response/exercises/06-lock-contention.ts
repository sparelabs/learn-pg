import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'find-blocking-query',
    lessonId: '',
    type: 'sql-query',
    title: 'Find the Blocking Query',
    prompt:
      'Queries are timing out on the accounts table. Use pg_stat_activity joined with pg_locks to find blocking and blocked session pairs. Write a query that returns blocked_pid, blocked_query, blocking_pid, and blocking_query by joining pg_stat_activity with pg_locks to find sessions where a lock is not granted (bl.granted = false) and another session holds a conflicting lock.',
    setupSql: `
      DROP TABLE IF EXISTS accounts;
      CREATE TABLE accounts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      INSERT INTO accounts (name, balance, status)
      SELECT
        'account_' || i,
        round((random() * 10000)::numeric, 2),
        CASE WHEN random() < 0.9 THEN 'active' ELSE 'suspended' END
      FROM generate_series(1, 10000) i;

      CREATE INDEX idx_accounts_status ON accounts(status);
      ANALYZE accounts;
    `,
    hints: [
      'Join pg_stat_activity with pg_locks to correlate PIDs with lock information',
      'Use bl.granted = false to find blocked lock requests',
      'Join pg_locks again to find the session holding the conflicting lock',
      'The blocking lock has the same locktype and relation but a different pid, and granted = true',
      'Alias the two pg_stat_activity joins as blocked and blocking',
    ],
    explanation:
      'This query pattern is essential for incident response. It joins pg_stat_activity (which has the query text and session info) with pg_locks (which has the lock state). By finding locks where granted = false, you identify blocked sessions. By finding another lock on the same relation with granted = true, you find the blocker. In production, tools like pg_blocking_pids() (PostgreSQL 9.6+) simplify this, but understanding the underlying join teaches you what is actually happening in the lock manager.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: [
              'blocked_pid',
              'blocked_query',
              'blocking_pid',
              'blocking_query',
            ],
          },
        },
      },
    },
    order: 1,
    difficulty: 7,
  },
  {
    id: 'terminate-blocker',
    lessonId: '',
    type: 'sql-query',
    title: 'Terminate the Blocker',
    prompt:
      'Now that you know which session is blocking others, terminate it. Write a query that finds the blocking PIDs using pg_blocking_pids() and terminates them with pg_terminate_backend(). Use: SELECT pid, pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = ANY(pg_blocking_pids(pg_backend_pid())) to terminate any session blocking the current connection. Note: in a real incident, you would substitute the actual blocked PID.',
    setupSql: `
      DROP TABLE IF EXISTS accounts;
      CREATE TABLE accounts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        balance NUMERIC(12,2) NOT NULL DEFAULT 0
      );

      INSERT INTO accounts (name, balance)
      SELECT 'account_' || i, round((random() * 10000)::numeric, 2)
      FROM generate_series(1, 1000) i;
    `,
    hints: [
      'pg_blocking_pids(pid) returns an array of PIDs blocking the given PID',
      'Use ANY() to match against the array',
      'pg_terminate_backend(pid) returns true if the signal was sent successfully',
      'In practice, you would use the actual blocked PID from the previous exercise',
    ],
    explanation:
      'pg_terminate_backend() is the standard tool for breaking lock chains in production. It sends SIGTERM to the target backend, which triggers a graceful shutdown: the current transaction is rolled back, locks are released, and the connection is closed. This is preferable to pg_cancel_backend() in lock contention scenarios because pg_cancel_backend() only cancels the current query but leaves the transaction open (and the locks held). After terminating the blocker, all queued sessions will be unblocked and can proceed.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['pid', 'pg_terminate_backend'],
          },
        },
      },
    },
    order: 2,
    difficulty: 6,
  },
  {
    id: 'prevent-recurrence',
    lessonId: '',
    type: 'sql-query',
    title: 'Prevent Recurrence with Timeouts',
    prompt:
      "Prevent this from happening again by setting defensive timeouts. Run: SET lock_timeout = '5s' to limit how long a query will wait for a lock, then SET statement_timeout = '30s' to limit total query execution time. Finally, verify with SHOW lock_timeout to confirm the setting took effect. Return the lock_timeout value.",
    setupSql: `
      -- No setup needed; this exercise is about session configuration.
      DROP TABLE IF EXISTS timeout_test;
      CREATE TABLE timeout_test (id INTEGER);
    `,
    hints: [
      "SET lock_timeout = '5s' prevents queries from waiting more than 5 seconds for locks",
      "SET statement_timeout = '30s' prevents any single query from running more than 30 seconds",
      'Use SHOW lock_timeout to verify the setting',
      'In production, set these in postgresql.conf or per-role with ALTER ROLE ... SET',
    ],
    explanation:
      "lock_timeout and statement_timeout are your safety nets against lock pile-ups. Without lock_timeout, a query will wait indefinitely for a lock, and all subsequent queries will queue behind it. With lock_timeout = '5s', the blocked query fails fast with an error, and the application can retry or take alternative action. statement_timeout provides a broader safety net against any runaway query. In production, you should set these at the role or database level (ALTER ROLE app SET lock_timeout = '5s') so they apply to all connections automatically.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['lock_timeout'],
          },
        },
      },
    },
    order: 3,
    difficulty: 4,
  },
];
