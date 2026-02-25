import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'index-maintenance-cost',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Index Maintenance Cost',
    prompt: 'A table with NO indexes has been created. Run EXPLAIN ANALYZE to insert 1,000 rows and observe the timing: EXPLAIN ANALYZE INSERT INTO perf_test (value) SELECT i FROM generate_series(1, 1000) i. Note the execution time — later exercises will compare this with indexed inserts.',
    setupSql: `
      DROP TABLE IF EXISTS perf_test;
      CREATE TABLE perf_test (
        id SERIAL,
        value INTEGER
      );
    `,
    hints: [
      'Use EXPLAIN ANALYZE before INSERT',
      'EXPLAIN ANALYZE INSERT INTO perf_test (value) SELECT i FROM generate_series(1, 1000) i',
      'Look at the "Execution Time" in the output'
    ],
    explanation: 'INSERT on a table with no indexes only needs to write to the heap. This gives you a baseline timing. Each index you add will increase INSERT time because every row must also be added to every index.',
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
    order: 1,
    difficulty: 2
  },
  {
    id: 'bulk-vs-individual',
    lessonId: '',
    type: 'sql-query',
    title: 'Bulk Create Index on Existing Data',
    prompt: 'A table with 100,000 rows already exists but has no index on the value column. Create an index and measure how long it takes using EXPLAIN ANALYZE. Run: EXPLAIN ANALYZE CREATE INDEX idx_perf_value ON perf_test(value). Bulk index creation is very efficient because it sorts all values first, then builds the tree bottom-up.',
    setupSql: `
      DROP TABLE IF EXISTS perf_test;
      CREATE TABLE perf_test (
        id SERIAL PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO perf_test (value) SELECT (random() * 1000000)::integer FROM generate_series(1, 100000);
      DROP INDEX IF EXISTS idx_perf_value;
    `,
    hints: [
      'EXPLAIN ANALYZE works with CREATE INDEX',
      'EXPLAIN ANALYZE CREATE INDEX idx_perf_value ON perf_test(value)',
      'The timing shows how long bulk index creation takes'
    ],
    explanation: 'CREATE INDEX on existing data uses a sort-based bulk loading algorithm: it reads all values, sorts them, then writes leaf pages in order and builds internal nodes on top. This is O(N) I/O, much faster than inserting N entries one at a time (which would be O(N log N) with random I/O).',
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
    difficulty: 2
  },
  {
    id: 'index-size-vs-table',
    lessonId: '',
    type: 'sql-query',
    title: 'Compare Index Size to Table Size',
    prompt: 'Compare the heap size and index size for the perf_test table. Select pg_size_pretty(pg_relation_size(\'perf_test\')) AS table_size, pg_size_pretty(pg_relation_size(\'idx_perf_value\')) AS index_size, pg_size_pretty(pg_total_relation_size(\'perf_test\')) AS total_size.',
    setupSql: `
      DROP TABLE IF EXISTS perf_test;
      CREATE TABLE perf_test (
        id SERIAL PRIMARY KEY,
        value INTEGER,
        label TEXT
      );
      INSERT INTO perf_test (value, label)
      SELECT (random() * 1000000)::integer, 'label_' || i
      FROM generate_series(1, 100000) i;
      CREATE INDEX idx_perf_value ON perf_test(value);
      ANALYZE perf_test;
    `,
    hints: [
      'pg_relation_size works on both tables and indexes',
      'pg_total_relation_size includes the table, all indexes, and TOAST data',
      'Compare table_size and index_size to see the overhead'
    ],
    explanation: 'Index storage is a real cost. For this table, the integer index is relatively compact compared to the table (which has wider rows). But for tables with many indexes or indexes on wide columns, total index size can exceed the table data. pg_total_relation_size includes everything.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['table_size', 'index_size', 'total_size']
          }
        }
      }
    },
    order: 3,
    difficulty: 2
  }
];
