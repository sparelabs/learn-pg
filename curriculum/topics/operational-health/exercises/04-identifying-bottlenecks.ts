import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'sequential-scans-large-tables',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Sequential Scans on Large Tables',
    prompt: 'Write a query to find tables with more than 10,000 live tuples that have sequential scans. Return: schemaname, relname, seq_scan, seq_tup_read, n_live_tup, and table_size (use pg_size_pretty). Order by seq_tup_read descending, limit 10.',
    setupSql: `
      CREATE TABLE large_scan_test (id INT, data TEXT);
      INSERT INTO large_scan_test SELECT generate_series(1, 20000), 'test data';
      -- Force statistics update
      ANALYZE large_scan_test;
      -- Trigger a sequential scan
      SELECT COUNT(*) FROM large_scan_test WHERE data LIKE '%test%';
    `,
    hints: [
      'Use pg_stat_user_tables',
      'Filter WHERE n_live_tup > 10000 AND seq_scan > 0',
      'Use pg_size_pretty(pg_relation_size(relid))',
      'Order by seq_tup_read DESC'
    ],
    explanation: 'Sequential scans on large tables can indicate missing indexes. However, sequential scans are appropriate for small tables or when retrieving most rows.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1, max: 10 },
          columns: {
            required: ['schemaname', 'relname', 'seq_scan', 'seq_tup_read', 'n_live_tup', 'table_size']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'unused-indexes',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Unused Indexes',
    prompt: 'Write a query to find indexes that have never been used (idx_scan = 0) and are not primary keys. Return: schemaname, tablename, indexname, idx_scan, and index_size (use pg_size_pretty). Order by pg_relation_size(indexrelid) descending.',
    setupSql: `
      CREATE TABLE unused_idx_test (id INT PRIMARY KEY, col1 INT, col2 TEXT);
      CREATE INDEX unused_idx ON unused_idx_test(col2);
      INSERT INTO unused_idx_test VALUES (1, 100, 'test');
    `,
    hints: [
      'Use pg_stat_user_indexes',
      'Filter WHERE idx_scan = 0',
      'Exclude primary keys: indexrelname NOT LIKE \'%_pkey\'',
      'Use pg_size_pretty(pg_relation_size(indexrelid))',
      'Order by pg_relation_size(indexrelid) DESC'
    ],
    explanation: 'Unused indexes waste disk space and slow down INSERT, UPDATE, and DELETE operations. However, be careful: an index might be unused due to insufficient query coverage or recent creation.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
          columns: {
            required: ['schemaname', 'tablename', 'indexname', 'idx_scan', 'index_size']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'hot-update-ratio',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate HOT Update Ratio',
    prompt: 'Write a query to calculate the HOT (Heap-Only Tuple) update ratio for tables with updates. Return: schemaname, relname, n_tup_upd, n_tup_hot_upd, hot_ratio (percentage, rounded to 2 decimals). Filter for tables with n_tup_upd > 0. Order by hot_ratio ascending (worst first), limit 10.',
    setupSql: `
      CREATE TABLE hot_test (id INT PRIMARY KEY, val INT, data TEXT);
      CREATE INDEX hot_test_val_idx ON hot_test(val);
      INSERT INTO hot_test SELECT generate_series(1, 1000), 100, 'data';
      -- Some updates (may or may not be HOT depending on what's updated)
      UPDATE hot_test SET data = 'updated' WHERE id <= 500;
    `,
    hints: [
      'Use pg_stat_user_tables',
      'Filter WHERE n_tup_upd > 0',
      'Calculate as 100.0 * n_tup_hot_upd / n_tup_upd',
      'Use NULLIF to handle division by zero',
      'Order by hot_ratio ASC'
    ],
    explanation: 'HOT updates are much more efficient as they avoid index updates when possible. A low HOT ratio may indicate too many indexes or updates to indexed columns.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1, max: 10 },
          columns: {
            required: ['schemaname', 'relname', 'n_tup_upd', 'n_tup_hot_upd', 'hot_ratio']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  },
  {
    id: 'long-running-queries',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Long-Running Queries',
    prompt: 'Write a query to find currently active queries running longer than 5 seconds. Return: pid, usename, query_start, duration (age from query_start to now), state, and query. Exclude queries on pg_stat_activity itself. Order by query_start ascending.',
    setupSql: '',
    hints: [
      'Use pg_stat_activity',
      'Filter WHERE state = \'active\'',
      'Use now() - query_start > interval \'5 seconds\'',
      'Exclude with query NOT LIKE \'%pg_stat_activity%\'',
      'Use age(now(), query_start) for duration'
    ],
    explanation: 'Long-running queries can indicate performance problems, missing indexes, or queries that need optimization. They may also be blocking other queries.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['pid', 'usename', 'query_start', 'duration', 'state', 'query']
          }
        }
      }
    },
    order: 4,
    difficulty: 2
  }
];
