import type { Exercise } from '@learn-pg/shared';

const exercises: Exercise[] = [
  {
    id: '02-caching-04-01',
    lessonId: '02-caching-and-prepared-statements-04',
    type: 'sql-query',
    title: 'Check plan_cache_mode Setting',
    prompt: 'Write a query to display the current plan_cache_mode setting.',
    setupSql: null,
    hints: [
      'Use SHOW plan_cache_mode',
      'Or query pg_settings WHERE name = \'plan_cache_mode\''
    ],
    explanation: 'plan_cache_mode controls whether PostgreSQL uses custom plans (optimized for specific parameters), generic plans (cached and reused), or automatically chooses based on cost comparison.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['plan_cache_mode'],
          exactMatch: false
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: '02-caching-04-02',
    lessonId: '02-caching-and-prepared-statements-04',
    type: 'sql-query',
    title: 'Monitor Plan Usage',
    prompt: 'Create a prepared statement "get_order" that selects all columns from an orders table where user_id = $1. Then write a query to check pg_prepared_statements showing the name, generic_plans, and custom_plans columns.',
    setupSql: `
      CREATE TABLE orders (id int PRIMARY KEY, user_id int, total numeric, created_at timestamp);
      INSERT INTO orders VALUES (1, 100, 50.00, '2024-01-01'), (2, 100, 75.00, '2024-01-02'), (3, 200, 100.00, '2024-01-03');
      PREPARE get_order (int) AS SELECT * FROM orders WHERE user_id = $1;
      EXECUTE get_order(100);
    `,
    hints: [
      'Query pg_prepared_statements',
      'SELECT name, generic_plans, custom_plans FROM pg_prepared_statements',
      'Filter WHERE name = \'get_order\' if needed'
    ],
    explanation: 'The generic_plans and custom_plans columns in pg_prepared_statements show how many times each type of plan has been used. After 5 custom plans, PostgreSQL evaluates whether to switch to a generic plan.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { min: 1 },
        columns: {
          required: ['name', 'generic_plans', 'custom_plans'],
          exactMatch: false
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: '02-caching-04-03',
    lessonId: '02-caching-and-prepared-statements-04',
    type: 'sql-query',
    title: 'Force Generic Plan Mode',
    prompt: 'Set plan_cache_mode to force_generic_plan for the current session, then verify the setting changed.',
    setupSql: null,
    hints: [
      'Use SET plan_cache_mode = \'force_generic_plan\'',
      'Then SHOW plan_cache_mode to verify'
    ],
    explanation: 'Setting plan_cache_mode to force_generic_plan makes PostgreSQL always use generic plans (cached), which eliminates planning overhead but may be suboptimal for skewed data.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['plan_cache_mode'],
          exactMatch: false
        }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: '02-caching-04-04',
    lessonId: '02-caching-and-prepared-statements-04',
    type: 'sql-query',
    title: 'Analyze Planning Time',
    prompt: 'Use EXPLAIN (ANALYZE, TIMING ON) to show both planning time and execution time for a simple query. The query should be: SELECT COUNT(*) FROM orders WHERE user_id = 100.',
    setupSql: `
      CREATE TABLE orders (id int PRIMARY KEY, user_id int, total numeric);
      CREATE INDEX orders_user_id_idx ON orders(user_id);
      INSERT INTO orders SELECT generate_series(1, 1000), (random() * 100)::int, (random() * 100)::numeric(10,2);
    `,
    hints: [
      'EXPLAIN (ANALYZE, TIMING ON) SELECT COUNT(*) FROM orders WHERE user_id = 100',
      'Look for "Planning Time" and "Execution Time" in output'
    ],
    explanation: 'EXPLAIN ANALYZE shows both planning time (how long it took to generate the plan) and execution time (how long the query actually ran). For frequently executed queries, planning time can be significant overhead.',
    validation: {
      strategy: 'result-match',
      rules: {
        // EXPLAIN output is complex, just verify it ran
        rowCount: { min: 1 }
      }
    },
    order: 4,
    difficulty: 3
  },
  {
    id: '02-caching-04-05',
    lessonId: '02-caching-and-prepared-statements-04',
    type: 'sql-query',
    title: 'Compare Custom vs Generic Plan Performance',
    prompt: 'First, set plan_cache_mode to force_custom_plan, prepare a statement "count_orders" that counts orders where user_id = $1, and execute it once. Then query pg_prepared_statements to see the custom_plans count.',
    setupSql: `
      CREATE TABLE orders (id int PRIMARY KEY, user_id int, total numeric);
      INSERT INTO orders SELECT generate_series(1, 500), (random() * 50)::int, (random() * 100)::numeric(10,2);
      CREATE INDEX orders_user_id_idx ON orders(user_id);
    `,
    hints: [
      'SET plan_cache_mode = \'force_custom_plan\'',
      'PREPARE count_orders (int) AS SELECT COUNT(*) FROM orders WHERE user_id = $1',
      'EXECUTE count_orders(10)',
      'SELECT name, custom_plans, generic_plans FROM pg_prepared_statements WHERE name = \'count_orders\''
    ],
    explanation: 'force_custom_plan makes every execution create a new plan optimized for the specific parameter values. This is useful for skewed data where parameter values drastically affect the optimal plan.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 1 },
        columns: {
          required: ['name', 'custom_plans', 'generic_plans'],
          exactMatch: false
        }
      }
    },
    order: 5,
    difficulty: 4
  },
  {
    id: '02-caching-04-06',
    lessonId: '02-caching-and-prepared-statements-04',
    type: 'sql-query',
    title: 'Identify High-Planning Overhead Queries',
    prompt: 'Query pg_stat_statements to find queries where planning time is significant. Show the query, calls, mean_plan_time, mean_exec_time, and calculate plan_to_exec_ratio (mean_plan_time / mean_exec_time). Filter for queries called more than 100 times. Order by total planning time (mean_plan_time * calls) descending, limit to 5.',
    setupSql: `
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
      -- Simulate some queries
      CREATE TABLE test_table (id int PRIMARY KEY, data text);
      INSERT INTO test_table SELECT generate_series(1, 100), 'data';
      SELECT * FROM test_table WHERE id = 1;
      SELECT * FROM test_table WHERE id = 2;
      SELECT * FROM test_table WHERE id = 3;
    `,
    hints: [
      'Query pg_stat_statements',
      'SELECT query, calls, mean_plan_time, mean_exec_time',
      'Add calculated column: mean_plan_time / NULLIF(mean_exec_time, 0) AS plan_to_exec_ratio',
      'WHERE calls > 100',
      'ORDER BY (mean_plan_time * calls) DESC LIMIT 5'
    ],
    explanation: 'Queries with high planning time relative to execution time are excellent candidates for prepared statements. By caching the plan, you eliminate the planning overhead on subsequent executions.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { max: 5 },
        columns: {
          required: ['query', 'calls', 'mean_plan_time', 'mean_exec_time', 'plan_to_exec_ratio'],
          exactMatch: false
        }
      }
    },
    order: 6,
    difficulty: 5
  }
];

export { exercises };
