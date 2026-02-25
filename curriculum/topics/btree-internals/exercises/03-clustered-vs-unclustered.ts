import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'check-correlation',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Column Correlation',
    prompt: 'Check the physical-to-logical correlation of the value column in the cluster_test table. Query pg_stats for the correlation where tablename = \'cluster_test\' and attname = \'value\'. A value near 0 means randomly ordered (unclustered).',
    setupSql: `
      DROP TABLE IF EXISTS cluster_test;
      CREATE TABLE cluster_test (
        id SERIAL PRIMARY KEY,
        value INTEGER
      );
      -- Insert values in random order to create low correlation
      INSERT INTO cluster_test (value)
      SELECT (random() * 100000)::integer FROM generate_series(1, 50000);
      CREATE INDEX idx_cluster_value ON cluster_test(value);
      ANALYZE cluster_test;
    `,
    hints: [
      'Query the pg_stats view',
      'Filter WHERE tablename = \'cluster_test\' AND attname = \'value\'',
      'Select the correlation column'
    ],
    explanation: 'The correlation in pg_stats measures how well the physical row order matches the logical (sorted) order of the column values. Values near 0 mean the data is randomly ordered relative to the column. The planner uses this to estimate the I/O cost of an index scan — low correlation means more random page reads.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['correlation']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'observe-heap-fetches',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Index Scan on Unclustered Data',
    prompt: 'Run EXPLAIN (ANALYZE, BUFFERS) on a range query over unclustered data to see how many buffer reads are needed. Run: EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM cluster_test WHERE value BETWEEN 100 AND 200. Notice the high number of buffer reads relative to rows returned.',
    setupSql: `
      DROP TABLE IF EXISTS cluster_test;
      CREATE TABLE cluster_test (
        id SERIAL PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO cluster_test (value)
      SELECT (random() * 100000)::integer FROM generate_series(1, 50000);
      CREATE INDEX idx_cluster_value ON cluster_test(value);
      ANALYZE cluster_test;
    `,
    hints: [
      'Use EXPLAIN (ANALYZE, BUFFERS) before your SELECT',
      'Look for "Buffers: shared hit=..." in the output',
      'With unclustered data, each row might require a different page read'
    ],
    explanation: 'With unclustered data, an index scan for a range of values requires fetching rows from many different pages scattered across the heap. Each heap fetch is a separate buffer read. You might read 50+ different pages for just 50 matching rows. After clustering, those same rows would be on just a few consecutive pages.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['QUERY PLAN']
          }
        }
      }
    },
    order: 2,
    difficulty: 3
  },
  {
    id: 'cluster-table',
    lessonId: '',
    type: 'sql-query',
    title: 'Cluster the Table',
    prompt: 'Physically reorder the cluster_test table to match the idx_cluster_value index using the CLUSTER command. Run: CLUSTER cluster_test USING idx_cluster_value. This rewrites the table with rows sorted by value.',
    setupSql: `
      DROP TABLE IF EXISTS cluster_test;
      CREATE TABLE cluster_test (
        id SERIAL PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO cluster_test (value)
      SELECT (random() * 100000)::integer FROM generate_series(1, 50000);
      CREATE INDEX idx_cluster_value ON cluster_test(value);
      ANALYZE cluster_test;
    `,
    hints: [
      'CLUSTER table_name USING index_name',
      'This physically reorders the table\'s heap pages',
      'The command returns no rows (DDL command)'
    ],
    explanation: 'CLUSTER rewrites the entire table with rows physically sorted according to the specified index. This is an expensive operation that requires an exclusive lock, but the result is dramatically improved I/O for range queries on that column. Note that PostgreSQL does not maintain the clustering — new inserts go wherever there\'s free space.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 0 }
        }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: 'correlation-after-cluster',
    lessonId: '',
    type: 'sql-query',
    title: 'Verify Clustering with Correlation',
    prompt: 'After clustering the table, run ANALYZE and check the correlation again. The correlation should now be near 1.0, indicating the physical order matches the index order. Run: ANALYZE cluster_test; then SELECT correlation FROM pg_stats WHERE tablename = \'cluster_test\' AND attname = \'value\'.',
    setupSql: `
      DROP TABLE IF EXISTS cluster_test;
      CREATE TABLE cluster_test (
        id SERIAL PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO cluster_test (value)
      SELECT (random() * 100000)::integer FROM generate_series(1, 50000);
      CREATE INDEX idx_cluster_value ON cluster_test(value);
      CLUSTER cluster_test USING idx_cluster_value;
      ANALYZE cluster_test;
    `,
    hints: [
      'After CLUSTER, run ANALYZE to update statistics',
      'Then check pg_stats for the new correlation value',
      'It should be very close to 1.0 now'
    ],
    explanation: 'After CLUSTER, the correlation is near 1.0 (typically 0.99+), meaning the physical row order closely matches the value column\'s sorted order. The planner now knows that index scans on this column will have good I/O locality — adjacent index entries point to adjacent heap pages, enabling sequential-like access patterns.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['correlation']
          }
        }
      }
    },
    order: 4,
    difficulty: 2
  }
];
