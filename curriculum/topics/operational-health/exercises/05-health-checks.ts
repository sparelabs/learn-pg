import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'connection-health-check',
    lessonId: '',
    type: 'sql-query',
    title: 'Connection Health Check',
    prompt: 'Write a query to check connection health. Return: current_connections, max_connections, available_connections (max - reserved - current), and status. Status should be "CRITICAL" if utilization > 95%, "WARNING" if > 80%, otherwise "OK". Use current_setting() for max_connections and superuser_reserved_connections.',
    setupSql: '',
    hints: [
      'Count from pg_stat_activity',
      'Get max_connections and superuser_reserved_connections from settings',
      'Calculate available as max - reserved - current',
      'Use CASE for status logic'
    ],
    explanation: 'Connection health monitoring prevents connection exhaustion, which can make the database unavailable. Connection pooling helps manage limited connections effectively.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['current_connections', 'max_connections', 'available_connections', 'status']
          }
        }
      }
    },
    order: 1,
    difficulty: 3
  },
  {
    id: 'transaction-wraparound-check',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Transaction ID Wraparound',
    prompt: 'Write a query to check for approaching transaction ID wraparound. Return: datname, xid_age (age of datfrozenxid), xids_remaining (2147483648 - xid_age), pct_towards_wraparound (rounded to 2 decimals), and status. Status should be "CRITICAL" if age > 1800000000, "WARNING" if > 1500000000, otherwise "OK". Filter for current_database().',
    setupSql: '',
    hints: [
      'Use pg_database',
      'Use age(datfrozenxid) for xid_age',
      'Max XID is 2147483648 (2^31)',
      'Calculate percentage as 100.0 * age / 2147483648',
      'Use CASE for status'
    ],
    explanation: 'Transaction ID wraparound can cause database shutdown if not addressed. Regular VACUUM prevents this by freezing old row versions. Monitor this metric closely in high-transaction databases.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['datname', 'xid_age', 'xids_remaining', 'pct_towards_wraparound', 'status']
          }
        }
      }
    },
    order: 2,
    difficulty: 3
  },
  {
    id: 'replication-lag-check',
    lessonId: '',
    type: 'sql-query',
    title: 'Replication Lag Health Check',
    prompt: 'Write a query to check replication lag. Return: is_replica (pg_is_in_recovery()), lag_seconds (extract epoch from now() - pg_last_xact_replay_timestamp(), rounded to integer), and status. Status should be "N/A" if not a replica, "CRITICAL" if lag > 60 seconds, "WARNING" if > 30 seconds, otherwise "OK".',
    setupSql: '',
    hints: [
      'Use pg_is_in_recovery() to check if replica',
      'Use pg_last_xact_replay_timestamp() for last replay time',
      'EXTRACT(epoch FROM interval) for seconds',
      'Use CASE with pg_is_in_recovery() check first'
    ],
    explanation: 'Replication lag indicates how far behind a replica is from the primary. High lag can cause stale reads and may indicate network issues, resource constraints, or high write load on the primary.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['is_replica', 'lag_seconds', 'status']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  },
  {
    id: 'vacuum-analyze-health',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Vacuum and Analyze Freshness',
    prompt: 'Write a query to check tables that have not been vacuumed in over 7 days. Return: schemaname, relname, hours_since_vacuum (extract epoch from age, divide by 3600, round to 2 decimals), n_live_tup, n_dead_tup. Use GREATEST(last_vacuum, last_autovacuum) for last vacuum time. Filter for tables with n_live_tup > 1000 and hours_since_vacuum > 168. Order by hours_since_vacuum descending.',
    setupSql: `
      CREATE TABLE stale_vacuum_test (id INT, data TEXT);
      INSERT INTO stale_vacuum_test SELECT generate_series(1, 5000), 'data';
      -- Note: Can't easily simulate old vacuum times in setup
    `,
    hints: [
      'Use pg_stat_user_tables',
      'Use GREATEST(last_vacuum, last_autovacuum)',
      'Calculate hours as EXTRACT(epoch FROM age(...)) / 3600',
      'Filter for n_live_tup > 1000',
      '168 hours = 7 days'
    ],
    explanation: 'Regular VACUUM and ANALYZE operations are critical for database health. Stale statistics lead to poor query plans, and lack of vacuuming causes bloat and can lead to transaction ID wraparound.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['schemaname', 'relname', 'hours_since_vacuum', 'n_live_tup', 'n_dead_tup']
          }
        }
      }
    },
    order: 4,
    difficulty: 3
  },
  {
    id: 'comprehensive-health-check',
    lessonId: '',
    type: 'sql-query',
    title: 'Create Comprehensive Health Check',
    prompt: 'Write a query that returns multiple health checks. Use UNION ALL to combine: (1) cache_hit_ratio check with columns: check_name, metric_value, status; (2) connection_utilization with same columns; (3) bloat_check showing max dead ratio. Each should have appropriate status (OK, WARNING, CRITICAL).',
    setupSql: `
      CREATE TABLE bloat_check_test (id INT, data TEXT);
      INSERT INTO bloat_check_test SELECT generate_series(1, 5000), 'data';
      UPDATE bloat_check_test SET data = 'updated' WHERE id <= 3000;
    `,
    hints: [
      'Use UNION ALL to combine multiple SELECT statements',
      'Each SELECT should return the same columns: check_name, metric_value, status',
      'Cast metric_value to TEXT or NUMERIC for consistency',
      'Use CASE statements for status determination'
    ],
    explanation: 'Comprehensive health checks combine multiple metrics into a single query for easy monitoring. This pattern is used by monitoring tools and can be exposed as an API endpoint for health dashboards.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 3 },
          columns: {
            required: ['check_name', 'metric_value', 'status']
          }
        }
      }
    },
    order: 5,
    difficulty: 4
  }
];
