import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'show-block-size',
    lessonId: '',
    type: 'sql-query',
    title: 'Show the Block Size',
    prompt: 'Run the command to display PostgreSQL\'s block size — the fundamental I/O unit size.',
    setupSql: '',
    hints: [
      'Use the SHOW command to display configuration parameters',
      'The parameter name is block_size'
    ],
    explanation: 'PostgreSQL stores all data in fixed 8KB (8192 byte) pages. This is a compile-time constant and the fundamental unit of I/O — every read and write operates on entire pages.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['block_size']
          }
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'table-filepath',
    lessonId: '',
    type: 'sql-query',
    title: 'Find a Table\'s File Path',
    prompt: 'Create a table called test_table with a single column (id INTEGER), then use pg_relation_filepath() to find where PostgreSQL stores its data file on disk.',
    setupSql: `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (id INTEGER);
      INSERT INTO test_table SELECT i FROM generate_series(1, 100) i;
    `,
    hints: [
      'Use SELECT pg_relation_filepath(\'table_name\')',
      'The function returns the file path relative to the data directory'
    ],
    explanation: 'pg_relation_filepath() returns the path to a table\'s data file relative to the PostgreSQL data directory. This is the heap file that contains all the table\'s pages.',
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
    difficulty: 1
  },
  {
    id: 'calculate-pages',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate Number of Pages',
    prompt: 'The test_table has been loaded with 10,000 rows. Calculate how many 8KB pages it occupies by dividing the table\'s size by 8192. Return a single column called "pages".',
    setupSql: `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (
        id INTEGER,
        name TEXT,
        value NUMERIC
      );
      INSERT INTO test_table
      SELECT i, 'row_' || i, random() * 1000
      FROM generate_series(1, 10000) i;
      ANALYZE test_table;
    `,
    hints: [
      'Use pg_relation_size(\'test_table\') to get the size in bytes',
      'Divide by 8192 to convert bytes to pages',
      'Use AS pages to name the result column'
    ],
    explanation: 'Dividing pg_relation_size() by 8192 (the block size) gives the number of pages a table occupies. This helps you understand the I/O cost of scanning a table — a sequential scan reads every one of these pages.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['pages']
          }
        }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: 'seq-vs-random-io',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Sequential vs Random I/O',
    prompt: 'A table with 100,000 rows and an index on the id column has been created. Run EXPLAIN (ANALYZE, BUFFERS) to see how PostgreSQL accesses data when filtering for a small range (id < 100). Look at the plan to see whether it chooses a sequential or index scan, and how many buffers it reads.',
    setupSql: `
      DROP TABLE IF EXISTS large_table;
      CREATE TABLE large_table (
        id INTEGER PRIMARY KEY,
        value TEXT
      );
      INSERT INTO large_table
      SELECT i, 'value_' || i
      FROM generate_series(1, 100000) i;
      CREATE INDEX IF NOT EXISTS idx_large_table_id ON large_table(id);
      ANALYZE large_table;
    `,
    hints: [
      'Use EXPLAIN (ANALYZE, BUFFERS) before your SELECT statement',
      'Filter with WHERE id < 100',
      'Look for "Buffers: shared hit=..." in the output'
    ],
    explanation: 'EXPLAIN (ANALYZE, BUFFERS) shows both the execution plan and actual buffer (page) access statistics. For a small range query, PostgreSQL typically uses an Index Scan with few random page reads. For a large range, it might prefer a Sequential Scan reading all pages in order.',
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
    order: 4,
    difficulty: 3
  },
  {
    id: 'relation-size-functions',
    lessonId: '',
    type: 'sql-query',
    title: 'Compare Table Size Functions',
    prompt: 'Query the total relation size (including indexes and TOAST) of test_table using pg_size_pretty(pg_total_relation_size(\'test_table\')). Return a single human-readable size value.',
    setupSql: `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (
        id SERIAL PRIMARY KEY,
        name TEXT,
        description TEXT
      );
      INSERT INTO test_table (name, description)
      SELECT 'item_' || i, repeat('description text ', 10)
      FROM generate_series(1, 5000) i;
      CREATE INDEX idx_test_name ON test_table(name);
      ANALYZE test_table;
    `,
    hints: [
      'Use pg_total_relation_size() to include indexes and TOAST data',
      'Wrap the result in pg_size_pretty() for human-readable output',
      'SELECT pg_size_pretty(pg_total_relation_size(...))'
    ],
    explanation: 'pg_total_relation_size() returns the total disk space used by a table including its indexes and TOAST data. This is always larger than pg_relation_size() which only returns the heap size. The difference tells you how much space indexes and TOAST add.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 }
        }
      }
    },
    order: 5,
    difficulty: 2
  }
];
