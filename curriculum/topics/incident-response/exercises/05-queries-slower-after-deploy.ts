import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'identify-slow-query',
    lessonId: '',
    type: 'sql-query',
    title: 'Identify the Slow Query',
    prompt:
      "After the deploy, the orders dashboard is timing out. Use EXPLAIN (ANALYZE) to examine the query that is slow: SELECT * FROM orders WHERE customer_id = 42. Look at the execution time and the plan node -- is it using the index or doing a sequential scan?",
    setupSql: `
      DROP TABLE IF EXISTS orders;
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        amount NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Before migration: only 5% of rows had customer_id set
      -- After migration: all rows have customer_id, most share a few values
      INSERT INTO orders (customer_id, status, amount, created_at)
      SELECT
        -- 95% of rows get customer_id between 1-50, 5% get 51-1000
        CASE WHEN random() < 0.95
          THEN (random() * 49 + 1)::int
          ELSE (random() * 949 + 51)::int
        END,
        CASE (i % 4)
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'processing'
          WHEN 2 THEN 'shipped'
          WHEN 3 THEN 'delivered'
        END,
        round((random() * 500 + 10)::numeric, 2),
        now() - (random() * interval '365 days')
      FROM generate_series(1, 100000) i;

      CREATE INDEX idx_orders_customer_id ON orders(customer_id);

      -- ANALYZE with the post-migration data
      ANALYZE orders;
    `,
    hints: [
      'Run EXPLAIN (ANALYZE) SELECT * FROM orders WHERE customer_id = 42',
      'Look at the plan type: Index Scan, Bitmap Heap Scan, or Seq Scan?',
      'Check the actual execution time in the output',
      'With most rows having customer_id in 1-50, customer_id = 42 matches many rows',
    ],
    explanation:
      'After the data migration backfilled customer_id for all historical rows, the column is no longer selective for common values. Customer_id = 42 now matches roughly 2% of 100K rows (about 2000 rows), which is enough that the planner may choose a Bitmap Heap Scan or even a Sequential Scan instead of an Index Scan. The planner is actually making the right decision for the new data distribution -- it is the data that changed, not a bug.',
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
    order: 1,
    difficulty: 5,
  },
  {
    id: 'explain-changed-plan',
    lessonId: '',
    type: 'sql-query',
    title: 'Understand the Plan Change',
    prompt:
      "Now compare: a rare customer_id still gets an Index Scan while a common one does not. Run EXPLAIN (ANALYZE) for customer_id = 999 (a rare value with few matching rows). Compare the plan type and cost to what you saw for customer_id = 42.",
    setupSql: `
      DROP TABLE IF EXISTS orders;
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        amount NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT now()
      );

      INSERT INTO orders (customer_id, status, amount, created_at)
      SELECT
        CASE WHEN random() < 0.95
          THEN (random() * 49 + 1)::int
          ELSE (random() * 949 + 51)::int
        END,
        CASE (i % 4)
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'processing'
          WHEN 2 THEN 'shipped'
          WHEN 3 THEN 'delivered'
        END,
        round((random() * 500 + 10)::numeric, 2),
        now() - (random() * interval '365 days')
      FROM generate_series(1, 100000) i;

      CREATE INDEX idx_orders_customer_id ON orders(customer_id);
      ANALYZE orders;
    `,
    hints: [
      'Run EXPLAIN (ANALYZE) SELECT * FROM orders WHERE customer_id = 999',
      'This value is rare -- only about 5 rows should match',
      'The planner should choose an Index Scan for this selective value',
      'Compare this to the plan for customer_id = 42 which matches ~2000 rows',
    ],
    explanation:
      'The planner uses the most_common_vals and most_common_freqs statistics from pg_stats to estimate how many rows match a given value. For customer_id = 999 (a rare value), the estimate is very low, so an Index Scan is cheapest. For customer_id = 42 (a common value matching ~2% of the table), the planner estimates enough rows that the random I/O cost of an Index Scan exceeds the sequential I/O cost of scanning the whole table. Both plans are correct for their respective data distributions.',
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
    difficulty: 6,
  },
  {
    id: 'check-correlation',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Column Correlation',
    prompt:
      "The final piece of the puzzle: check the pg_stats view to understand the physical correlation of the customer_id column. Query pg_stats for the orders table's customer_id column and return the tablename, attname, correlation, n_distinct, and most_common_vals. The correlation value explains why index scans are more expensive than expected.",
    setupSql: `
      DROP TABLE IF EXISTS orders;
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        amount NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT now()
      );

      INSERT INTO orders (customer_id, status, amount, created_at)
      SELECT
        CASE WHEN random() < 0.95
          THEN (random() * 49 + 1)::int
          ELSE (random() * 949 + 51)::int
        END,
        CASE (i % 4)
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'processing'
          WHEN 2 THEN 'shipped'
          WHEN 3 THEN 'delivered'
        END,
        round((random() * 500 + 10)::numeric, 2),
        now() - (random() * interval '365 days')
      FROM generate_series(1, 100000) i;

      CREATE INDEX idx_orders_customer_id ON orders(customer_id);
      ANALYZE orders;
    `,
    hints: [
      "Query pg_stats WHERE tablename = 'orders' AND attname = 'customer_id'",
      'Select tablename, attname, correlation, n_distinct, and most_common_vals',
      'A correlation near 0 means the physical row order is unrelated to the index order',
      'Low correlation makes index scans expensive because each row fetch is a random page read',
    ],
    explanation:
      "The correlation statistic (range -1 to 1) measures how well the physical order of rows on disk matches the logical order of the index. A correlation near 0 means rows with similar customer_id values are scattered randomly across disk pages. This makes index scans expensive because fetching each row requires reading a different page (random I/O). A correlation near 1 or -1 means the data is physically ordered, making index scans efficient. After a bulk backfill migration, correlation is typically low because the values were assigned randomly to existing rows. The planner factors this into its cost calculation via the 'correlation' field in pg_stats.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['tablename', 'attname', 'correlation', 'n_distinct', 'most_common_vals'],
          },
        },
      },
    },
    order: 3,
    difficulty: 7,
  },
];
