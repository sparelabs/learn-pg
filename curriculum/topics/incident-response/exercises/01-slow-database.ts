import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'diagnose-slow-queries',
    lessonId: '',
    type: 'sql-query',
    title: 'Find the Slow Queries',
    prompt:
      'The database is slow but you do not know which queries are the problem. Query pg_stat_statements to find the top 5 queries by mean execution time. Return the query text, mean_exec_time, and calls columns, ordered by mean_exec_time descending.',
    setupSql: `
      DROP TABLE IF EXISTS orders;
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        amount NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Insert 50,000 rows
      INSERT INTO orders (customer_name, status, amount, created_at)
      SELECT
        'customer_' || (i % 500),
        CASE (i % 5)
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'processing'
          WHEN 2 THEN 'shipped'
          WHEN 3 THEN 'delivered'
          WHEN 4 THEN 'cancelled'
        END,
        round((random() * 500 + 10)::numeric, 2),
        now() - (random() * interval '365 days')
      FROM generate_series(1, 50000) i;

      CREATE INDEX idx_orders_status ON orders(status);
      CREATE INDEX idx_orders_customer ON orders(customer_name);

      -- ANALYZE so planner knows about the 50k rows
      ANALYZE orders;

      -- Now delete 90% of rows to simulate the retention cleanup
      DELETE FROM orders WHERE id % 10 != 0;

      -- Do NOT run ANALYZE — statistics still think there are 50k rows
      -- Run some queries to populate pg_stat_statements
      SELECT count(*) FROM orders WHERE status = 'pending';
      SELECT * FROM orders WHERE status = 'pending' LIMIT 100;
      SELECT * FROM orders WHERE customer_name = 'customer_42';
    `,
    hints: [
      'Query the pg_stat_statements view',
      'Order by mean_exec_time DESC to see slowest queries first',
      'Use LIMIT 5 to get only the top offenders',
    ],
    explanation:
      'pg_stat_statements is your first stop when "the database is slow." It tracks execution statistics for every query, letting you quickly identify which queries are consuming the most time. The mean_exec_time column shows average execution time in milliseconds, and calls shows how frequently each query runs.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['query', 'mean_exec_time', 'calls'],
          },
          rowCount: { min: 1, max: 5 },
        },
      },
    },
    order: 1,
    difficulty: 5,
  },
  {
    id: 'explain-bad-plan',
    lessonId: '',
    type: 'sql-query',
    title: 'Examine the Bad Query Plan',
    prompt:
      "Run EXPLAIN (ANALYZE) on the slow query: SELECT * FROM orders WHERE status = 'pending'. Look at the plan output -- notice how the planner's estimated row count differs wildly from the actual row count. The planner thinks there are thousands of rows matching 'pending' because the statistics are stale.",
    setupSql: `
      DROP TABLE IF EXISTS orders;
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        amount NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT now()
      );

      INSERT INTO orders (customer_name, status, amount, created_at)
      SELECT
        'customer_' || (i % 500),
        CASE (i % 5)
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'processing'
          WHEN 2 THEN 'shipped'
          WHEN 3 THEN 'delivered'
          WHEN 4 THEN 'cancelled'
        END,
        round((random() * 500 + 10)::numeric, 2),
        now() - (random() * interval '365 days')
      FROM generate_series(1, 50000) i;

      CREATE INDEX idx_orders_status ON orders(status);

      -- ANALYZE with full dataset so planner records 50k rows
      ANALYZE orders;

      -- Delete 90% — planner still thinks 50k exist
      DELETE FROM orders WHERE id % 10 != 0;
    `,
    hints: [
      "Use EXPLAIN (ANALYZE) SELECT * FROM orders WHERE status = 'pending'",
      'Compare the rows=XXXX (estimated) with the actual rows in the output',
      'Stale statistics cause the planner to overestimate row counts',
    ],
    explanation:
      'When EXPLAIN ANALYZE shows a large gap between estimated and actual rows, it means the planner is working with stale statistics. Here the planner estimated ~10,000 rows for status = \'pending\' (based on the pre-delete statistics) but the actual count is around 1,000. This mismatch causes the planner to choose a suboptimal plan, such as a Sequential Scan when an Index Scan would be far more efficient for the reduced dataset.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['QUERY PLAN'],
          },
        },
      },
    },
    order: 2,
    difficulty: 5,
  },
  {
    id: 'fix-with-analyze',
    lessonId: '',
    type: 'sql-query',
    title: 'Fix the Statistics',
    prompt:
      "Run ANALYZE on the orders table to update the statistics, then run EXPLAIN (ANALYZE) on the same query again: SELECT * FROM orders WHERE status = 'pending'. The estimated rows should now be much closer to the actual rows, and the planner should choose a better plan.",
    setupSql: `
      DROP TABLE IF EXISTS orders;
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        amount NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT now()
      );

      INSERT INTO orders (customer_name, status, amount, created_at)
      SELECT
        'customer_' || (i % 500),
        CASE (i % 5)
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'processing'
          WHEN 2 THEN 'shipped'
          WHEN 3 THEN 'delivered'
          WHEN 4 THEN 'cancelled'
        END,
        round((random() * 500 + 10)::numeric, 2),
        now() - (random() * interval '365 days')
      FROM generate_series(1, 50000) i;

      CREATE INDEX idx_orders_status ON orders(status);
      ANALYZE orders;

      -- Delete 90% to create stale statistics
      DELETE FROM orders WHERE id % 10 != 0;
    `,
    hints: [
      'Run ANALYZE orders; first to update the table statistics',
      "Then run EXPLAIN (ANALYZE) SELECT * FROM orders WHERE status = 'pending'",
      'Combine both statements separated by a semicolon',
    ],
    explanation:
      'After running ANALYZE, PostgreSQL collects fresh statistics about the table\'s actual row count and value distribution. The planner now knows the table has ~5,000 rows instead of 50,000, and the estimated rows for the WHERE clause match reality. With accurate statistics, the planner can choose the most efficient plan. This is why running ANALYZE after large data changes (bulk deletes, migrations, bulk loads) is critical.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['QUERY PLAN'],
          },
        },
      },
    },
    order: 3,
    difficulty: 5,
  },
];
