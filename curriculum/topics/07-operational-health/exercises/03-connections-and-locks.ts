import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'connection-utilization',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate Connection Utilization',
    prompt: 'Write a query to calculate connection utilization. Return: current_connections (count from pg_stat_activity), max_connections (from settings), and utilization_pct (rounded to 2 decimals). Use current_setting() to get max_connections.',
    setupSql: '',
    hints: [
      'Count connections from pg_stat_activity',
      'Use current_setting(\'max_connections\')::int',
      'Calculate percentage as 100.0 * current / max',
      'Use round() for 2 decimals'
    ],
    explanation: 'Monitoring connection utilization helps prevent connection exhaustion. When utilization exceeds 80%, consider implementing connection pooling or increasing max_connections.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['current_connections', 'max_connections', 'utilization_pct']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'idle-in-transaction',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Idle in Transaction Connections',
    prompt: 'Write a query to find all idle in transaction connections. Return: pid, usename, state_change, idle_duration (age from state_change to now), and query. Order by state_change ascending (oldest first).',
    setupSql: '',
    hints: [
      'Filter WHERE state = \'idle in transaction\'',
      'Use age(now(), state_change) for idle_duration',
      'Include backend_type filter if needed',
      'Order by state_change ASC for oldest first'
    ],
    explanation: 'Idle in transaction connections hold locks and prevent VACUUM from cleaning up old row versions. They often indicate application bugs where transactions are not properly committed or rolled back.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['pid', 'usename', 'state_change', 'idle_duration', 'query']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'current-locks-summary',
    lessonId: '',
    type: 'sql-query',
    title: 'Summarize Current Locks',
    prompt: 'Write a query to summarize locks by type and mode. Return: locktype, mode, total_count (all locks), granted_count (granted locks), and waiting_count (locks not granted). Order by total_count descending.',
    setupSql: '',
    hints: [
      'Use pg_locks view',
      'GROUP BY locktype, mode',
      'Use COUNT(*) for total',
      'Use COUNT(*) FILTER (WHERE granted) for granted_count',
      'Use COUNT(*) FILTER (WHERE NOT granted) for waiting_count'
    ],
    explanation: 'Understanding lock distribution helps identify contention. A high number of waiting locks indicates blocking issues that need investigation.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['locktype', 'mode', 'total_count', 'granted_count', 'waiting_count']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  },
  {
    id: 'blocking-queries',
    lessonId: '',
    type: 'sql-query',
    title: 'Identify Blocking Queries',
    prompt: 'Write a query to show blocking relationships. Return: blocked_pid, blocked_user (usename), blocking_pid, blocking_user (usename), blocked_query, and blocking_query. Join pg_locks and pg_stat_activity to find locks where blocked_locks.granted = false.',
    setupSql: `
      -- Create a test scenario (this is conceptual, actual blocking is hard to simulate)
      CREATE TABLE IF NOT EXISTS lock_test (id INT);
    `,
    hints: [
      'Join pg_locks to itself (blocked and blocking)',
      'Match on locktype, database, relation, etc.',
      'Ensure blocking_locks.pid != blocked_locks.pid',
      'Join to pg_stat_activity twice for query text',
      'Filter WHERE NOT blocked_locks.granted'
    ],
    explanation: 'Identifying which queries are blocking others is critical for resolving performance issues. The blocking query often needs to be optimized or terminated.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['blocked_pid', 'blocked_user', 'blocking_pid', 'blocking_user', 'blocked_query', 'blocking_query']
          }
        }
      }
    },
    order: 4,
    difficulty: 4
  }
];
