import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'view-work-mem',
    lessonId: '',
    type: 'sql-query',
    title: 'Check work_mem Setting',
    prompt: 'Write a query to display the current work_mem setting.',
    setupSql: '',
    hints: [
      'Use the SHOW command',
      'The parameter is work_mem'
    ],
    explanation: 'work_mem controls the amount of memory used for internal sort operations and hash tables before writing to temporary disk files. Larger work_mem can improve performance for sorts and hash operations but uses more memory per operation.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 }
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'view-pg-stats',
    lessonId: '',
    type: 'sql-query',
    title: 'View Column Statistics',
    prompt: 'Query pg_stats to view statistics for all columns in the sample_table, showing the column name, n_distinct, and correlation.',
    setupSql: `
      DROP TABLE IF EXISTS sample_table;
      CREATE TABLE sample_table (
        id SERIAL PRIMARY KEY,
        category TEXT,
        value INTEGER
      );
      INSERT INTO sample_table (category, value)
      SELECT
        CASE (i % 5)
          WHEN 0 THEN 'A'
          WHEN 1 THEN 'B'
          WHEN 2 THEN 'C'
          WHEN 3 THEN 'D'
          ELSE 'E'
        END,
        i
      FROM generate_series(1, 1000) i;
      ANALYZE sample_table;
    `,
    hints: [
      'SELECT from pg_stats',
      'Filter WHERE tablename = \'sample_table\'',
      'Select attname, n_distinct, and correlation columns'
    ],
    explanation: 'The pg_stats view provides human-readable access to table statistics. n_distinct shows the number of distinct values (negative means percentage of rows). Correlation shows how well the physical row order matches the logical value order.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['attname', 'n_distinct', 'correlation']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'compare-estimated-actual',
    lessonId: '',
    type: 'sql-query',
    title: 'Compare Estimated vs Actual Rows',
    prompt: 'Use EXPLAIN ANALYZE to see both estimated and actual row counts for selecting from sample_table where value > 500.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS sample_table (
        id SERIAL PRIMARY KEY,
        category TEXT,
        value INTEGER
      );
      TRUNCATE sample_table;
      INSERT INTO sample_table (category, value)
      SELECT
        CASE (i % 5)
          WHEN 0 THEN 'A'
          WHEN 1 THEN 'B'
          WHEN 2 THEN 'C'
          WHEN 3 THEN 'D'
          ELSE 'E'
        END,
        i
      FROM generate_series(1, 1000) i;
      ANALYZE sample_table;
    `,
    hints: [
      'Use EXPLAIN ANALYZE',
      'SELECT * FROM sample_table WHERE value > 500',
      'Look for both rows=X (estimate) and actual rows=Y in output'
    ],
    explanation: 'EXPLAIN ANALYZE shows both estimated rows (from planner statistics) and actual rows (from execution). Large discrepancies indicate stale or insufficient statistics, which can lead to suboptimal query plans.',
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
  },
  {
    id: 'increase-statistics-target',
    lessonId: '',
    type: 'sql-query',
    title: 'Increase Statistics Target',
    prompt: 'Alter the sample_table to increase the statistics target for the value column to 500.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS sample_table (
        id SERIAL PRIMARY KEY,
        category TEXT,
        value INTEGER
      );
      TRUNCATE sample_table;
      INSERT INTO sample_table (category, value)
      SELECT
        CASE (i % 5)
          WHEN 0 THEN 'A'
          WHEN 1 THEN 'B'
          WHEN 2 THEN 'C'
          WHEN 3 THEN 'D'
          ELSE 'E'
        END,
        i
      FROM generate_series(1, 1000) i;
    `,
    hints: [
      'Use ALTER TABLE ... ALTER COLUMN',
      'SET STATISTICS to 500',
      'The column is value on sample_table'
    ],
    explanation: 'The statistics target controls how many samples are taken during ANALYZE and how large the histogram is. Higher values (default 100) provide more accurate selectivity estimates but make ANALYZE slower. Useful for columns with many distinct values or uneven distributions.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 0 }
        }
      }
    },
    order: 4,
    difficulty: 2
  },
  {
    id: 'view-mcv-histogram',
    lessonId: '',
    type: 'sql-query',
    title: 'View Most Common Values',
    prompt: 'Query pg_stats to see the most_common_vals and most_common_freqs for the category column in sample_table.',
    setupSql: `
      DROP TABLE IF EXISTS sample_table;
      CREATE TABLE sample_table (
        id SERIAL PRIMARY KEY,
        category TEXT,
        value INTEGER
      );
      INSERT INTO sample_table (category, value)
      SELECT
        CASE (i % 5)
          WHEN 0 THEN 'A'
          WHEN 1 THEN 'B'
          WHEN 2 THEN 'C'
          WHEN 3 THEN 'D'
          ELSE 'E'
        END,
        i
      FROM generate_series(1, 1000) i;
      ANALYZE sample_table;
    `,
    hints: [
      'SELECT from pg_stats',
      'Filter WHERE tablename = \'sample_table\' AND attname = \'category\'',
      'Select most_common_vals and most_common_freqs'
    ],
    explanation: 'PostgreSQL tracks the most common values (MCVs) and their frequencies for each column. The planner uses this to estimate selectivity for equality conditions. If a value appears in the MCV list, the planner uses its actual frequency; otherwise, it assumes uniform distribution.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['most_common_vals', 'most_common_freqs']
          },
          rowCount: { exact: 1 }
        }
      }
    },
    order: 5,
    difficulty: 3
  },
  {
    id: 'observe-sort-cost',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Sort Cost',
    prompt: 'Use EXPLAIN ANALYZE to show the plan and sort details for selecting all rows from sample_table ordered by value DESC.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS sample_table (
        id SERIAL PRIMARY KEY,
        category TEXT,
        value INTEGER
      );
      TRUNCATE sample_table;
      INSERT INTO sample_table (category, value)
      SELECT
        CASE (i % 5)
          WHEN 0 THEN 'A'
          WHEN 1 THEN 'B'
          WHEN 2 THEN 'C'
          WHEN 3 THEN 'D'
          ELSE 'E'
        END,
        i
      FROM generate_series(1, 1000) i;
      ANALYZE sample_table;
    `,
    hints: [
      'Use EXPLAIN ANALYZE',
      'SELECT * FROM sample_table ORDER BY value DESC',
      'Look for "Sort" node with Sort Method and Memory Usage'
    ],
    explanation: 'The Sort node shows how PostgreSQL sorts data. Sort Method indicates whether the sort was done in memory (quicksort) or on disk (external merge). Memory Usage shows how much work_mem was used. Sorts spilling to disk are much slower.',
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
    order: 6,
    difficulty: 2
  },
  {
    id: 'observe-hash-batches',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Hash Join Batches',
    prompt: 'Use EXPLAIN ANALYZE to show a hash join between two tables, observing the Hash node with Buckets and Batches information.',
    setupSql: `
      DROP TABLE IF EXISTS table_a CASCADE;
      DROP TABLE IF EXISTS table_b CASCADE;

      CREATE TABLE table_a (
        id INTEGER,
        data TEXT
      );

      CREATE TABLE table_b (
        id INTEGER,
        info TEXT
      );

      INSERT INTO table_a (id, data)
      SELECT i, 'Data ' || i
      FROM generate_series(1, 1000) i;

      INSERT INTO table_b (id, info)
      SELECT i, 'Info ' || i
      FROM generate_series(1, 1000) i;

      ANALYZE table_a;
      ANALYZE table_b;
    `,
    hints: [
      'Use EXPLAIN ANALYZE',
      'SELECT * FROM table_a a JOIN table_b b ON a.id = b.id',
      'Look for Hash node with Buckets and Batches in output'
    ],
    explanation: 'The Hash node in a Hash Join shows Buckets (hash table size) and Batches (number of passes). Batches > 1 means the hash table did not fit in work_mem and had to be split into multiple batches, requiring disk I/O. This significantly increases cost.',
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
    order: 7,
    difficulty: 3
  }
];
