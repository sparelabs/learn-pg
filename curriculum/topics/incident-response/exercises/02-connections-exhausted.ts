import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'diagnose-connection-state',
    lessonId: '',
    type: 'sql-query',
    title: 'Assess the Connection State',
    prompt:
      'Connections are being refused. Your first step is to understand what all the existing connections are doing. Query pg_stat_activity to get a breakdown of connection states: group by state and count the number of connections in each state. Return columns named state and connection_count, ordered by connection_count descending.',
    setupSql: `
      -- We simulate the situation by examining the current state.
      -- In a real incident, pg_stat_activity would show many idle-in-transaction sessions.
      -- The student is practicing the diagnostic query pattern.
      DROP TABLE IF EXISTS incident_config;
      CREATE TABLE incident_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      INSERT INTO incident_config VALUES ('app_version', '2.4.1'), ('feature_flag', 'enabled');
    `,
    hints: [
      'Query pg_stat_activity and GROUP BY state',
      'Use count(*) AS connection_count',
      'ORDER BY connection_count DESC to see the most common state first',
    ],
    explanation:
      'When connections are exhausted, the first diagnostic step is understanding the state distribution. The key states are: "active" (running a query), "idle" (connected but not in a transaction), "idle in transaction" (in an open transaction but not running a query), and "idle in transaction (aborted)". A large number of "idle in transaction" sessions is a red flag -- those connections are held hostage by unclosed transactions.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['state', 'connection_count'],
          },
          rowCount: { min: 1 },
        },
      },
    },
    order: 1,
    difficulty: 4,
  },
  {
    id: 'find-idle-transactions',
    lessonId: '',
    type: 'sql-query',
    title: 'Find the Idle-in-Transaction Sessions',
    prompt:
      "Now drill into the problem sessions. Query pg_stat_activity to find all connections that are in the 'idle in transaction' state. Return the pid, state, query (the last query they ran), usename, and the duration they have been in this state (calculated as now() - xact_start, aliased as transaction_duration). Order by transaction_duration descending to see the worst offenders first.",
    setupSql: `
      DROP TABLE IF EXISTS incident_config;
      CREATE TABLE incident_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      INSERT INTO incident_config VALUES ('app_version', '2.4.1');
    `,
    hints: [
      "Filter pg_stat_activity with WHERE state = 'idle in transaction'",
      'Use now() - xact_start to calculate how long the transaction has been open',
      'Alias the duration column as transaction_duration',
      'ORDER BY transaction_duration DESC NULLS LAST',
    ],
    explanation:
      "Sessions stuck in 'idle in transaction' are the most common cause of connection exhaustion. Each one holds a database connection and prevents VACUUM from cleaning up dead tuples visible to that transaction's snapshot. The xact_start column shows when the transaction began, so now() - xact_start tells you how long it has been open. Sessions open for hours or days are almost certainly leaked transactions from buggy application code.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['pid', 'state', 'query', 'usename', 'transaction_duration'],
          },
        },
      },
    },
    order: 2,
    difficulty: 5,
  },
  {
    id: 'fix-terminate-idle',
    lessonId: '',
    type: 'sql-query',
    title: 'Terminate the Offenders',
    prompt:
      "In a real incident, you would terminate the idle-in-transaction sessions that have been open too long. Write a query that calls pg_terminate_backend() for every session that is in the 'idle in transaction' state and has had its transaction open for more than 5 minutes (now() - xact_start > interval '5 minutes'). Exclude your own session using pg_backend_pid(). Return the pid and the result of pg_terminate_backend().",
    setupSql: `
      DROP TABLE IF EXISTS incident_config;
      CREATE TABLE incident_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      INSERT INTO incident_config VALUES ('app_version', '2.4.1');
    `,
    hints: [
      'SELECT pid, pg_terminate_backend(pid) FROM pg_stat_activity WHERE ...',
      "Filter for state = 'idle in transaction'",
      "Add AND now() - xact_start > interval '5 minutes'",
      'Exclude yourself with AND pid != pg_backend_pid()',
    ],
    explanation:
      "pg_terminate_backend() sends a SIGTERM to the specified backend process, causing it to terminate its connection and roll back any open transaction. This is the standard emergency response for connection exhaustion caused by leaked transactions. In production, you should also set idle_in_transaction_session_timeout (e.g., to '10min') to prevent this from recurring. The application code should also be fixed to properly close transactions in error paths.",
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
    order: 3,
    difficulty: 6,
  },
];
