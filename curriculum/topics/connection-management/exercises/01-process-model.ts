import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'count-backends',
    lessonId: '',
    type: 'sql-query',
    title: 'Count Client Backends',
    prompt:
      "PostgreSQL forks a separate OS process for every client connection. Query `pg_stat_activity` to count how many client backend processes are currently running. Return a single column called `backend_count`.\n\nFilter for `backend_type = 'client backend'` to exclude background workers like autovacuum, WAL writer, etc.",
    setupSql: '',
    hints: [
      "Use SELECT count(*) FROM pg_stat_activity",
      "Filter with WHERE backend_type = 'client backend'",
      'Alias the count as backend_count'
    ],
    explanation:
      "Each row in pg_stat_activity with backend_type = 'client backend' represents a separate OS process forked by the postmaster. Each of these processes consumes ~2-3MB of RAM even when idle, and all contribute to the O(n) cost of GetSnapshotData(). This is why connection poolers are essential — they keep the number of server-side backend processes low while supporting many application connections.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['backend_count']
          }
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'backend-memory',
    lessonId: '',
    type: 'sql-query',
    title: 'Inspect Backend Processes',
    prompt:
      "Get details about each client backend process. Query `pg_stat_activity` to show the `pid`, `usename`, `application_name`, and `state` columns for all client backends.\n\nThis gives you visibility into who is connected, from what application, and what each connection is currently doing (active, idle, idle in transaction, etc.).",
    setupSql: '',
    hints: [
      'SELECT pid, usename, application_name, state FROM pg_stat_activity',
      "Filter with WHERE backend_type = 'client backend'",
      'Each row is a separate OS process with its own memory allocation'
    ],
    explanation:
      "The pid column shows the actual OS process ID — you can cross-reference this with `ps` on the server or use it with `pg_terminate_backend(pid)` to kill a connection. The state column is particularly important: 'active' means currently executing, 'idle' means waiting for commands, and 'idle in transaction' means a transaction is open but no query is running — a potentially dangerous state we'll cover later.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['pid', 'usename', 'application_name', 'state']
          }
        }
      }
    },
    order: 2,
    difficulty: 1
  }
];
