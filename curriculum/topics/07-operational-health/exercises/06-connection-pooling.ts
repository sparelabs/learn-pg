import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'check-max-connections',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Maximum Connections Setting',
    prompt: 'Write a query to display the current max_connections setting for the PostgreSQL server.',
    setupSql: '',
    hints: [
      'Use the SHOW command',
      'The setting is called max_connections'
    ],
    explanation: 'The max_connections parameter defines the maximum number of concurrent connections PostgreSQL will accept. This is a critical setting for capacity planning and connection pooling configuration.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['max_connections'],
          exactMatch: false
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'count-current-connections',
    lessonId: '',
    type: 'sql-query',
    title: 'Count Current Active Connections',
    prompt: 'Write a query to count the total number of current connections to the database.',
    setupSql: '',
    hints: [
      'Query the pg_stat_activity view',
      'Use COUNT(*) to count rows',
      'Each row represents one connection'
    ],
    explanation: 'pg_stat_activity shows one row per server process, representing active connections. Monitoring connection count helps identify when you\'re approaching limits or experiencing connection leaks.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['count'],
          exactMatch: false
        },
        rowCount: { exact: 1 }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'connections-by-state',
    lessonId: '',
    type: 'sql-query',
    title: 'Analyze Connection States',
    prompt: 'Write a query to show the count of connections grouped by their state. Include columns: state, count. Order by count descending.',
    setupSql: '',
    hints: [
      'Query pg_stat_activity',
      'GROUP BY state',
      'Use COUNT(*) to count connections per state',
      'ORDER BY count DESC'
    ],
    explanation: 'Connection state reveals what connections are doing: "active" (executing queries), "idle" (connected but inactive), "idle in transaction" (transaction open but not executing). High counts of "idle in transaction" often indicate application bugs.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['state', 'count'],
          exactMatch: false
        }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: 'identify-idle-connections',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Long-Running Idle Connections',
    prompt: 'Write a query to find connections that have been idle for more than 5 minutes. Show: pid, usename, datname, state, and how long they\'ve been idle (call it idle_duration). Order by idle duration descending.',
    setupSql: `
      -- Simulate some activity
      SELECT pg_sleep(0.01);
    `,
    hints: [
      'Query pg_stat_activity',
      'Filter WHERE state = \'idle\'',
      'Calculate duration: NOW() - state_change',
      'Filter for duration > interval \'5 minutes\'',
      'Use AS idle_duration for the duration column'
    ],
    explanation: 'Long-running idle connections indicate connection leaks where applications aren\'t properly closing connections. These waste resources and can eventually exhaust max_connections.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['pid', 'usename', 'datname', 'state', 'idle_duration'],
          exactMatch: false
        }
      }
    },
    order: 4,
    difficulty: 3
  },
  {
    id: 'idle-in-transaction',
    lessonId: '',
    type: 'sql-query',
    title: 'Detect Idle in Transaction Connections',
    prompt: 'Write a query to find connections in "idle in transaction" state. Show: pid, usename, transaction_duration (time since transaction started), and idle_duration (time since state changed). Order by transaction duration descending.',
    setupSql: '',
    hints: [
      'Query pg_stat_activity',
      'Filter WHERE state LIKE \'idle in transaction%\'',
      'Transaction duration: NOW() - xact_start',
      'Idle duration: NOW() - state_change',
      'Use AS to name calculated columns'
    ],
    explanation: '"Idle in transaction" connections are dangerous - they hold locks and prevent VACUUM from cleaning up dead rows. Applications should always commit or rollback promptly. Long-running idle transactions often indicate bugs.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['pid', 'usename', 'transaction_duration', 'idle_duration'],
          exactMatch: false
        }
      }
    },
    order: 5,
    difficulty: 3
  },
  {
    id: 'connection-utilization',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate Connection Utilization Percentage',
    prompt: 'Write a query that shows: current_connections (count from pg_stat_activity), max_connections (from settings), available_connections (max - current), and utilization_pct (percentage of max in use). Return one row.',
    setupSql: '',
    hints: [
      'Use a subquery or CTE to get the count from pg_stat_activity',
      'Get max_connections with current_setting(\'max_connections\')::int',
      'Calculate available: max - current',
      'Calculate percentage: 100.0 * current / max',
      'Use ROUND() for cleaner percentages'
    ],
    explanation: 'Monitoring connection utilization helps you know when you\'re approaching limits. If utilization regularly exceeds 80%, consider adding a connection pooler or increasing max_connections.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 1 },
        columns: {
          required: ['current_connections', 'max_connections', 'available_connections', 'utilization_pct'],
          exactMatch: false
        }
      }
    },
    order: 6,
    difficulty: 4
  },
  {
    id: 'connections-by-database',
    lessonId: '',
    type: 'sql-query',
    title: 'Group Connections by Database',
    prompt: 'Write a query to show connection counts grouped by database. Include: datname, connection_count. Filter out NULL database names. Order by connection_count descending.',
    setupSql: '',
    hints: [
      'Query pg_stat_activity',
      'GROUP BY datname',
      'Use COUNT(*) for connection count',
      'Filter WHERE datname IS NOT NULL',
      'ORDER BY connection_count DESC'
    ],
    explanation: 'Grouping connections by database helps identify which databases are consuming the most connections. This is useful for sizing connection pools per database and identifying connection leaks in specific applications.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['datname', 'connection_count'],
          exactMatch: false
        }
      }
    },
    order: 7,
    difficulty: 2
  }
];
