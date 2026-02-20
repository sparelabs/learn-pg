import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'active-connections',
    lessonId: '',
    type: 'sql-query',
    title: 'View Active Connections',
    prompt: 'Write a query to show all active database connections with their process ID (pid), username (usename), database name (datname), and current query. Exclude the current query itself.',
    setupSql: '',
    hints: [
      'Use the pg_stat_activity view',
      'Filter for state = \'active\'',
      'Use pg_backend_pid() to exclude your own query'
    ],
    explanation: 'pg_stat_activity provides real-time information about active database processes. The state column shows whether a connection is active, idle, or idle in transaction.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['pid', 'usename', 'datname', 'query']
          }
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'connection-count-by-state',
    lessonId: '',
    type: 'sql-query',
    title: 'Count Connections by State',
    prompt: 'Write a query to count the number of connections grouped by their state. Include columns: state and connection_count. Order by connection_count descending.',
    setupSql: '',
    hints: [
      'Use pg_stat_activity',
      'GROUP BY state',
      'Use COUNT(*) for connection_count',
      'Order by connection_count DESC'
    ],
    explanation: 'Understanding connection states helps identify issues like connection leaks (many idle connections) or stuck transactions (idle in transaction).',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['state', 'connection_count'],
            exactMatch: true
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'database-cache-hit-ratio',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate Cache Hit Ratio',
    prompt: 'Write a query to calculate the cache hit ratio for the current database. Return columns: datname, cache_hit_ratio (rounded to 2 decimal places). The formula is: 100.0 * blks_hit / (blks_hit + blks_read).',
    setupSql: '',
    hints: [
      'Use pg_stat_database',
      'Filter for current_database()',
      'Use round() for 2 decimal places',
      'Handle division by zero with NULLIF'
    ],
    explanation: 'Cache hit ratio indicates how often data is found in memory vs. read from disk. A ratio above 95% is generally good. Low ratios may indicate insufficient shared_buffers or missing indexes.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['datname', 'cache_hit_ratio'],
            exactMatch: true
          }
        }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: 'tables-needing-vacuum',
    lessonId: '',
    type: 'sql-query',
    title: 'Identify Tables Needing Vacuum',
    prompt: 'Write a query to find user tables with more than 1000 dead tuples. Return: schemaname, relname, n_live_tup, n_dead_tup, and dead_ratio (percentage of dead tuples, rounded to 2 decimals). Order by n_dead_tup descending.',
    setupSql: `
      CREATE TABLE test_bloat (id INT, data TEXT);
      INSERT INTO test_bloat SELECT generate_series(1, 5000), 'data';
      UPDATE test_bloat SET data = 'updated' WHERE id <= 2500;
    `,
    hints: [
      'Use pg_stat_user_tables',
      'Filter WHERE n_dead_tup > 1000',
      'Calculate dead_ratio as 100.0 * n_dead_tup / (n_live_tup + n_dead_tup)',
      'Use NULLIF to handle division by zero'
    ],
    explanation: 'Dead tuples are outdated row versions that need to be cleaned up by VACUUM. High dead tuple counts can slow down queries and waste space.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
          columns: {
            required: ['schemaname', 'relname', 'n_live_tup', 'n_dead_tup', 'dead_ratio']
          }
        }
      }
    },
    order: 4,
    difficulty: 3
  }
];
