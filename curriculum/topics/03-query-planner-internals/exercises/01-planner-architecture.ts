import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'check-seq-page-cost',
    lessonId: '',
    type: 'sql-query',
    title: 'View Sequential Page Cost',
    prompt: 'Write a query to display the current seq_page_cost setting.',
    setupSql: '',
    hints: [
      'Use the SHOW command',
      'The setting name is seq_page_cost'
    ],
    explanation: 'The seq_page_cost parameter represents the cost to read one page sequentially. It defaults to 1.0 and serves as the baseline unit for cost calculations.',
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
    id: 'check-random-page-cost',
    lessonId: '',
    type: 'sql-query',
    title: 'Compare Random Page Cost',
    prompt: 'Write a query to display the current random_page_cost setting.',
    setupSql: '',
    hints: [
      'Use SHOW to check configuration parameters',
      'The parameter is random_page_cost'
    ],
    explanation: 'The random_page_cost represents the cost of random (non-sequential) page access. The default of 4.0 assumes HDDs where random access is 4x slower than sequential. For SSDs, this should be lowered to around 1.1.',
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
    id: 'view-table-statistics',
    lessonId: '',
    type: 'sql-query',
    title: 'View Table Row Count',
    prompt: 'Write a query to show the estimated number of rows (reltuples) and pages (relpages) for tables in the pg_class catalog. Filter to show only regular tables (relkind = \'r\') and order by table name.',
    setupSql: `
      CREATE TABLE sample_data (
        id SERIAL PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO sample_data (value) SELECT i FROM generate_series(1, 100) i;
      ANALYZE sample_data;
    `,
    hints: [
      'Query the pg_class system catalog',
      'Select relname, reltuples, and relpages columns',
      'Filter where relkind = \'r\'',
      'Order by relname'
    ],
    explanation: 'The pg_class catalog stores metadata about tables including reltuples (estimated row count) and relpages (number of pages). These statistics are used by the planner to estimate costs.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['relname', 'reltuples', 'relpages']
          }
        }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: 'analyze-table',
    lessonId: '',
    type: 'sql-query',
    title: 'Update Table Statistics',
    prompt: 'Write a query to update statistics for the sample_data table.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS sample_data (
        id SERIAL PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO sample_data (value) SELECT i FROM generate_series(1, 100) i
      ON CONFLICT DO NOTHING;
    `,
    hints: [
      'Use the ANALYZE command',
      'Specify the table name: sample_data'
    ],
    explanation: 'ANALYZE collects statistics about the contents of tables. The query planner uses these statistics to determine the most efficient execution plans. Run ANALYZE after significant data changes.',
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
    difficulty: 1
  }
];
