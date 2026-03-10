import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'check-max-connections',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Connection Usage vs Limit',
    prompt:
      "Pool exhaustion happens when all available connections are occupied. Even without a pooler, PostgreSQL has a hard limit (`max_connections`).\n\nWrite a query that shows:\n- `current_connections`: the number of active client backends\n- `max_connections`: the configured maximum\n- `remaining`: how many connection slots are still available\n\nThis query is a key operational tool — run it whenever you suspect connection exhaustion.",
    setupSql: '',
    hints: [
      "Count rows from pg_stat_activity WHERE backend_type = 'client backend'",
      "Get max_connections from pg_settings: (SELECT setting::int FROM pg_settings WHERE name = 'max_connections')",
      'Calculate remaining as max_connections minus current_connections'
    ],
    explanation:
      "This query gives you an instant health check: how close are you to the connection limit? In a pooled environment, the current_connections count reflects the pooler's server connections (which should be stable and well below max_connections). Without a pooler, this count fluctuates with application traffic and can spike dangerously close to the limit during traffic bursts. A good alert threshold is 70% utilization as a warning and 90% as critical.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['current_connections', 'max_connections', 'remaining']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'connection-wait-timeout',
    lessonId: '',
    type: 'sql-query',
    title: 'Understand Connection Timeouts',
    prompt:
      "When a pool is exhausted, clients wait for a connection to become available. Three key timeouts control how long things wait:\n\n1. **checkout_timeout** (pooler): How long a client waits for a server connection from the pool\n2. **statement_timeout** (PostgreSQL): How long a query can run before being killed\n3. **idle_in_transaction_session_timeout** (PostgreSQL): How long a transaction can sit idle\n\nQuery `pg_settings` to show the current values of `statement_timeout` and `idle_in_transaction_session_timeout`. Return columns: `name`, `setting`, `unit`.\n\nNote: checkout_timeout is a pooler setting, not visible in PostgreSQL's pg_settings.",
    setupSql: '',
    hints: [
      'Query pg_settings with a WHERE clause filtering for the two parameter names',
      "WHERE name IN ('statement_timeout', 'idle_in_transaction_session_timeout')",
      'Select the name, setting, and unit columns'
    ],
    explanation:
      "These timeouts are your safety net against pool exhaustion. statement_timeout prevents runaway queries from holding connections forever. idle_in_transaction_session_timeout kills sessions that open a transaction and forget to close it. The checkout_timeout (configured in PGDog, not PostgreSQL) determines how long application clients wait before getting a timeout error. Together, these three settings prevent cascading failures: queries get killed before they hold connections too long, idle transactions get cleaned up, and clients fail fast instead of piling up indefinitely.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 2 },
          columns: {
            required: ['name', 'setting', 'unit']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  }
];
