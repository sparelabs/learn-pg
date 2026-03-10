import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'check-connection-settings',
    lessonId: '',
    type: 'sql-query',
    title: 'Review Connection Settings',
    prompt:
      "Before making any operational changes, always review the current connection-related settings. Query `pg_settings` to show the `name`, `setting`, and `unit` for these key parameters:\n\n- `max_connections`\n- `superuser_reserved_connections`\n- `idle_in_transaction_session_timeout`\n- `statement_timeout`\n- `lock_timeout`\n- `tcp_keepalives_idle`\n\nOrder the results by `name`.\n\nThis query is part of the standard operational health check and should be run before any maintenance procedure.",
    setupSql: '',
    hints: [
      "Use WHERE name IN (...) to filter for the specific settings",
      'Select name, setting, and unit columns',
      'ORDER BY name for consistent output'
    ],
    explanation:
      "This is your pre-flight checklist for connection management. max_connections tells you the hard limit. superuser_reserved_connections ensures DBAs can always connect. The three timeout settings (idle_in_transaction, statement, lock) are your safety nets against runaway sessions. tcp_keepalives_idle controls how quickly dead TCP connections are detected. If any timeout is set to 0 (disabled), that's a potential risk — production systems should always have statement_timeout and idle_in_transaction_session_timeout configured.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 6 },
          columns: {
            required: ['name', 'setting', 'unit']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'terminate-idle-connections',
    lessonId: '',
    type: 'sql-query',
    title: 'Terminate Idle Connections',
    prompt:
      "When connection cleanup is needed, `pg_terminate_backend()` is your tool. It sends SIGTERM to the specified backend process, closing the connection and rolling back any open transaction.\n\nWrite a query that would terminate all client backends that have been in the `idle` state for more than 1 hour. Use `pg_terminate_backend(pid)` and make sure to exclude your own session (`pid != pg_backend_pid()`).\n\nReturn the `pid` and result of `pg_terminate_backend(pid)` as `terminated` for each terminated connection.\n\n**Note**: This may return 0 rows if no connections have been idle for over an hour — that's fine and actually indicates a healthy system.",
    setupSql: '',
    hints: [
      "Use SELECT pid, pg_terminate_backend(pid) AS terminated FROM pg_stat_activity",
      "Filter with WHERE state = 'idle' AND now() - state_change > interval '1 hour'",
      'Add AND pid != pg_backend_pid() to avoid terminating your own session'
    ],
    explanation:
      "pg_terminate_backend() is the standard way to clean up problematic connections. It's more forceful than pg_cancel_backend() (which only cancels the current query) — it actually closes the connection. Always exclude your own PID to avoid disconnecting yourself. In a pooled environment, terminating a server connection causes PGDog to establish a new one, so the pool recovers automatically. This query is safe to run routinely — any properly-behaving application will reconnect automatically. For idle-in-transaction sessions specifically, change the WHERE clause to state = 'idle in transaction'.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['pid', 'terminated']
          }
        }
      }
    },
    order: 2,
    difficulty: 3
  }
];
