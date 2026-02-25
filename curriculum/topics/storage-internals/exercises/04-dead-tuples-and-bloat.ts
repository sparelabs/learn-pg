import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'observe-dead-tuples',
    lessonId: '',
    type: 'sql-query',
    title: 'Monitor Dead Tuple Count',
    prompt: 'A table with 5,000 rows has been created and 2,500 rows have been updated (creating dead tuples). Query pg_stat_user_tables to see the dead tuple count. Select relname, n_live_tup, and n_dead_tup for the bloat_test table.',
    setupSql: `
      DROP TABLE IF EXISTS bloat_test;
      CREATE TABLE bloat_test (
        id INTEGER PRIMARY KEY,
        value TEXT
      );
      INSERT INTO bloat_test SELECT i, 'original_' || i FROM generate_series(1, 5000) i;
      ANALYZE bloat_test;
      UPDATE bloat_test SET value = 'updated_' || id WHERE id <= 2500;
    `,
    hints: [
      'Query pg_stat_user_tables system view',
      'Filter WHERE relname = \'bloat_test\'',
      'Select relname, n_live_tup, n_dead_tup columns'
    ],
    explanation: 'pg_stat_user_tables tracks estimated live and dead tuple counts. After updating 2,500 rows, you should see approximately 2,500 dead tuples (the old row versions) and 5,000 live tuples. Dead tuples consume disk space and slow down sequential scans until VACUUM removes them.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['relname', 'n_live_tup', 'n_dead_tup']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'table-bloat-growth',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Table Size Growth from Bloat',
    prompt: 'A table was created, populated, and then every row was updated. Query pg_relation_size(\'bloat_test\') to see the current table size in bytes. The table will be roughly double its ideal size because every UPDATE created a dead tuple alongside the new live tuple.',
    setupSql: `
      DROP TABLE IF EXISTS bloat_test;
      CREATE TABLE bloat_test (
        id INTEGER,
        value TEXT
      );
      INSERT INTO bloat_test SELECT i, repeat('data_', 20) FROM generate_series(1, 5000) i;
      -- Update every row, creating 5000 dead tuples
      UPDATE bloat_test SET value = repeat('new_data_', 20);
    `,
    hints: [
      'SELECT pg_relation_size(\'bloat_test\') AS table_bytes',
      'You can also add pg_size_pretty() for a human-readable format',
      'The result will be roughly 2x what a fresh 5000-row table would be'
    ],
    explanation: 'After a mass UPDATE, the table contains both the 5,000 new live tuples and 5,000 dead tuples (the old versions). This roughly doubles the table size. The dead tuples still occupy pages and are read during sequential scans. VACUUM would reclaim this space for reuse.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'pgstattuple-analysis',
    lessonId: '',
    type: 'sql-query',
    requiresSuperuser: true,
    title: 'Precise Bloat Analysis with pgstattuple',
    prompt: 'Use the pgstattuple extension to get precise bloat statistics for the bloat_test table. Run: SELECT * FROM pgstattuple(\'bloat_test\'). Look at dead_tuple_count and dead_tuple_percent to see exactly how much space is wasted.',
    setupSql: `
      DROP TABLE IF EXISTS bloat_test;
      CREATE TABLE bloat_test (
        id INTEGER,
        value TEXT
      );
      INSERT INTO bloat_test SELECT i, 'original_' || i FROM generate_series(1, 3000) i;
      UPDATE bloat_test SET value = 'updated_' || id WHERE id <= 1500;
    `,
    hints: [
      'SELECT * FROM pgstattuple(\'bloat_test\')',
      'pgstattuple is an extension that performs a full table scan',
      'Look for dead_tuple_count and dead_tuple_percent in the output'
    ],
    explanation: 'pgstattuple performs a physical scan of the table and returns precise statistics: table_len (total size), tuple_count/tuple_len (live data), dead_tuple_count/dead_tuple_len (wasted space), and free_space (available for reuse). Unlike pg_stat_user_tables which has estimates, pgstattuple gives exact numbers by reading every page.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['dead_tuple_count']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  }
];
