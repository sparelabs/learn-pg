import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'pg-stat-activity-monitoring',
    lessonId: '',
    type: 'sql-query',
    title: 'Monitor Connection States',
    prompt:
      "The foundation of connection monitoring is `pg_stat_activity`. Write a query that shows each connection's `pid`, `usename`, `state`, `wait_event_type`, `wait_event`, and how long it has been in its current state (as `time_in_state`).\n\nFilter for client backends only and order by `time_in_state` descending to see the longest-sitting connections first.\n\nThis is the first query you should run when investigating connection issues.",
    setupSql: '',
    hints: [
      "Calculate time_in_state as now() - state_change",
      "Filter with WHERE backend_type = 'client backend'",
      'ORDER BY time_in_state DESC to see stale connections first'
    ],
    explanation:
      "This query is your starting point for connection troubleshooting. Connections in 'active' state with long time_in_state have slow-running queries. Connections in 'idle in transaction' with long time_in_state are holding resources without doing work. The wait_event columns tell you what active connections are blocked on — common culprits are lock waits (wait_event_type = 'Lock') and I/O waits (wait_event_type = 'IO'). In a pooled environment, you'll see the pooler's server connections here, not individual application clients.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['pid', 'usename', 'state', 'wait_event_type', 'wait_event', 'time_in_state']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'connection-state-summary',
    lessonId: '',
    type: 'sql-query',
    title: 'Summarize Connection States',
    prompt:
      "Create a summary of connection states — the single most important monitoring query for connection health.\n\nGroup client backends by `state` and count them. Return columns `state` and `connection_count`, ordered by `connection_count` descending.\n\nA healthy system shows mostly 'idle' and 'active' connections. A high count of 'idle in transaction' is a warning sign.",
    setupSql: '',
    hints: [
      "SELECT state, count(*) AS connection_count FROM pg_stat_activity",
      "Filter with WHERE backend_type = 'client backend'",
      'GROUP BY state ORDER BY connection_count DESC'
    ],
    explanation:
      "This summary query should be part of every connection health check. The ideal distribution depends on your workload, but generally: 'idle' connections are normal (server connections in the pool waiting for work), 'active' connections are doing useful work, and 'idle in transaction' connections are potentially problematic. If idle-in-transaction exceeds 20% of total connections, investigate immediately — those sessions are holding server connections, blocking VACUUM, and potentially holding locks.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['state', 'connection_count']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  }
];
