import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'index-dead-entries',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Index Size Before and After VACUUM',
    prompt:
      'A table `idx_test` has been created with 20,000 rows and an index on the `status` column. Then all rows were updated (changing the `status` column), creating dead tuples and dead index entries.\n\nFirst, check the index size with `pg_relation_size(\'idx_test_status\')`. Then run `VACUUM idx_test;` and check the index size again.\n\nReturn the index size after VACUUM as `index_size_after` using `pg_size_pretty`.',
    setupSql: `
      DROP TABLE IF EXISTS idx_test;
      CREATE TABLE idx_test (id SERIAL PRIMARY KEY, status TEXT, data TEXT);
      INSERT INTO idx_test (status, data)
      SELECT
        CASE WHEN random() < 0.5 THEN 'active' ELSE 'inactive' END,
        repeat('x', 50)
      FROM generate_series(1, 20000);
      CREATE INDEX idx_test_status ON idx_test (status);
      ANALYZE idx_test;
      UPDATE idx_test SET status = 'archived';
    `,
    hints: [
      'Run: VACUUM idx_test; SELECT pg_size_pretty(pg_relation_size(\'idx_test_status\')) AS index_size_after;',
      'VACUUM removes dead index entries pointing to dead heap tuples',
      'The index size may not shrink much — like heap pages, index pages are not returned to the OS',
    ],
    explanation:
      'When rows are updated, the old index entries remain pointing to dead heap tuples. VACUUM scans each index to remove these dead entries. However, like the heap, the index file does not shrink — the freed space is available for new index entries but the file size stays the same. This is why heavily-updated tables with many indexes can accumulate significant index bloat over time.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['index_size_after'],
          },
        },
      },
    },
    order: 1,
    difficulty: 3,
  },
  {
    id: 'reindex',
    lessonId: '',
    type: 'sql-query',
    title: 'Compact an Index with REINDEX',
    prompt:
      'The index `idx_test_status` on the `idx_test` table has accumulated bloat from updates. Unlike VACUUM (which removes dead entries but does not compact), REINDEX completely rebuilds the index.\n\nRun `REINDEX INDEX idx_test_status;` and then check the resulting index size with `pg_size_pretty(pg_relation_size(\'idx_test_status\'))` as `index_size_after_reindex`.',
    setupSql: `
      DROP TABLE IF EXISTS idx_test;
      CREATE TABLE idx_test (id SERIAL PRIMARY KEY, status TEXT, data TEXT);
      INSERT INTO idx_test (status, data)
      SELECT
        CASE WHEN random() < 0.5 THEN 'active' ELSE 'inactive' END,
        repeat('x', 50)
      FROM generate_series(1, 20000);
      CREATE INDEX idx_test_status ON idx_test (status);
      ANALYZE idx_test;
      UPDATE idx_test SET status = 'archived';
      VACUUM idx_test;
    `,
    hints: [
      'Run: REINDEX INDEX idx_test_status; SELECT pg_size_pretty(pg_relation_size(\'idx_test_status\')) AS index_size_after_reindex;',
      'REINDEX drops the old index and builds a new one from scratch',
      'The new index will be compact — no wasted space from dead entries or page splits',
    ],
    explanation:
      'REINDEX rebuilds an index completely, eliminating all bloat. After the update and VACUUM, the index has freed space from removed dead entries but the file is still bloated. REINDEX creates a fresh, compact index. Note that standard REINDEX takes an ACCESS EXCLUSIVE lock (blocking reads and writes). In production, use REINDEX CONCURRENTLY (PostgreSQL 12+) to rebuild without blocking.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['index_size_after_reindex'],
          },
        },
      },
    },
    order: 2,
    difficulty: 3,
  },
];
