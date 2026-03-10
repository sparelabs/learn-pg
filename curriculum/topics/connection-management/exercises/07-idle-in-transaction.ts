import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'find-idle-transactions',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Idle-in-Transaction Sessions',
    prompt:
      "Idle-in-transaction sessions are the most dangerous connection state — they pin pooler connections, block VACUUM, and hold locks. Your first step in any connection incident is finding them.\n\nWrite a query against `pg_stat_activity` that finds all sessions in the `idle in transaction` state. Return:\n- `pid`\n- `usename`\n- `transaction_age` (calculated as `now() - xact_start`)\n- `last_query` (the `query` column, truncated to 80 characters with `left(query, 80)`)\n\nOrder by `transaction_age` descending to see the worst offenders first.",
    setupSql: `
      DROP TABLE IF EXISTS idle_txn_demo;
      CREATE TABLE idle_txn_demo (id serial PRIMARY KEY, value text);
      INSERT INTO idle_txn_demo (value) SELECT 'item_' || i FROM generate_series(1, 100) i;
    `,
    hints: [
      "Filter with WHERE state = 'idle in transaction'",
      'Calculate transaction_age as now() - xact_start',
      'Use left(query, 80) AS last_query to truncate the query text',
      'ORDER BY transaction_age DESC'
    ],
    explanation:
      "This query is your go-to diagnostic tool when pool exhaustion or VACUUM starvation is suspected. Each row represents a session that opened a transaction (BEGIN) and then stopped sending queries without committing or rolling back. The transaction_age tells you how long resources have been held. Sessions idle for more than a few minutes are almost always bugs (forgotten commits, unhandled exceptions). The last_query column gives you a clue about what the application was doing before it went idle.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['pid', 'usename', 'transaction_age', 'last_query']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'idle-transaction-timeout',
    lessonId: '',
    type: 'sql-query',
    title: 'Configure Idle Transaction Timeout',
    prompt:
      "The best defense against idle-in-transaction sessions is the `idle_in_transaction_session_timeout` setting. When set, PostgreSQL automatically terminates sessions that stay idle in a transaction for longer than the specified duration.\n\nFirst, check the current value with `SHOW idle_in_transaction_session_timeout`, then set it to 60 seconds for your session:\n\n```sql\nSET idle_in_transaction_session_timeout = '60s';\nSHOW idle_in_transaction_session_timeout;\n```\n\nReturn the result of the `SHOW` command to verify the setting was applied.",
    setupSql: '',
    hints: [
      "Use SET to change the parameter, then SHOW to display it",
      "SET idle_in_transaction_session_timeout = '60s';",
      'SHOW idle_in_transaction_session_timeout;'
    ],
    explanation:
      "With this setting at 60 seconds, any session that begins a transaction and then sits idle for more than 60 seconds will be automatically terminated by PostgreSQL. The session receives a FATAL error, and any locks, pins, and snapshot holds are released. This is a critical production safety net — set it at the database level with ALTER DATABASE so it applies to all sessions. Typical production values range from 60s to 300s. PGDog also has its own client_idle_in_transaction_timeout setting that works at the pooler level for faster detection.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['idle_in_transaction_session_timeout']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  }
];
