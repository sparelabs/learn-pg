import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'in-memory-sort',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe In-Memory Sort',
    prompt: 'With generous work_mem, sort a large table entirely in memory. Run: SET work_mem = \'64MB\'; EXPLAIN (ANALYZE) SELECT * FROM big_table ORDER BY value. Look for "Sort Method: quicksort Memory:" in the output — this means the sort completed in memory.',
    setupSql: `
      DROP TABLE IF EXISTS big_table;
      CREATE TABLE big_table (
        id SERIAL PRIMARY KEY,
        value INTEGER,
        label TEXT
      );
      INSERT INTO big_table (value, label)
      SELECT (random() * 1000000)::integer, 'row_' || i
      FROM generate_series(1, 100000) i;
      ANALYZE big_table;
    `,
    hints: [
      'First SET work_mem, then EXPLAIN (ANALYZE)',
      'Both statements can be in one submission separated by semicolons',
      'Look for "quicksort Memory:" in the QUERY PLAN output'
    ],
    explanation: 'With 64MB of work_mem, the 100K-row table easily fits in memory. PostgreSQL uses its in-memory quicksort algorithm, which is the fastest sort method. The "Memory:" value shows how much RAM was actually used for the sort.',
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
    id: 'disk-sort',
    lessonId: '',
    type: 'sql-query',
    title: 'Force a Disk Sort',
    prompt: 'With tiny work_mem, force the sort to spill to disk. Run: SET work_mem = \'64kB\'; EXPLAIN (ANALYZE) SELECT * FROM big_table ORDER BY value. Look for "Sort Method: external merge Disk:" — this means the sort couldn\'t fit in memory and used temporary files.',
    setupSql: `
      DROP TABLE IF EXISTS big_table;
      CREATE TABLE big_table (
        id SERIAL PRIMARY KEY,
        value INTEGER,
        label TEXT
      );
      INSERT INTO big_table (value, label)
      SELECT (random() * 1000000)::integer, 'row_' || i
      FROM generate_series(1, 100000) i;
      ANALYZE big_table;
    `,
    hints: [
      'SET work_mem = \'64kB\' forces very limited memory',
      'The sort must spill to temporary files on disk',
      'Look for "external merge Disk:" in the QUERY PLAN'
    ],
    explanation: 'With only 64kB of work_mem, the 100K rows cannot be sorted in memory. PostgreSQL falls back to external merge sort: it creates sorted "runs" that fit in memory, writes them to temporary files, then merges the runs together. The "Disk:" value shows how much data was written to temp files. This is significantly slower than in-memory sorting.',
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
    id: 'top-n-heapsort',
    lessonId: '',
    type: 'sql-query',
    title: 'Top-N Heapsort with LIMIT',
    prompt: 'When you only need the top N rows, PostgreSQL uses a heap (priority queue) that needs very little memory regardless of table size. Run: EXPLAIN (ANALYZE) SELECT * FROM big_table ORDER BY value LIMIT 10. Look for "Sort Method: top-N heapsort Memory:".',
    setupSql: `
      DROP TABLE IF EXISTS big_table;
      CREATE TABLE big_table (
        id SERIAL PRIMARY KEY,
        value INTEGER,
        label TEXT
      );
      INSERT INTO big_table (value, label)
      SELECT (random() * 1000000)::integer, 'row_' || i
      FROM generate_series(1, 100000) i;
      ANALYZE big_table;
    `,
    hints: [
      'EXPLAIN (ANALYZE) SELECT * FROM big_table ORDER BY value LIMIT 10',
      'With LIMIT, PostgreSQL only tracks the top 10 rows using a heap',
      'Memory usage will be minimal (typically 25-30kB)'
    ],
    explanation: 'Top-N heapsort maintains a min-heap of N elements. For each input row, it checks if the row belongs in the top N and swaps if so. This uses only O(N) memory regardless of input size — sorting 100K rows to find the top 10 uses only ~25kB. This is why LIMIT dramatically changes sort performance.',
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
    order: 3,
    difficulty: 2
  }
];
