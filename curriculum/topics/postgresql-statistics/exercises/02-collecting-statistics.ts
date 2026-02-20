import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'analyze-specific-columns',
    lessonId: '',
    type: 'sql-query',
    title: 'Analyze Specific Columns',
    prompt: 'Run ANALYZE on the "orders" table, but only for the "customer_id" and "status" columns.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS orders (
        order_id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        status VARCHAR(50),
        total_amount DECIMAL(10, 2),
        order_date DATE
      );
      INSERT INTO orders (customer_id, status, total_amount, order_date)
      SELECT
        (random() * 1000)::INTEGER,
        CASE (random() * 4)::INTEGER
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'processing'
          WHEN 2 THEN 'shipped'
          ELSE 'delivered'
        END,
        (random() * 500 + 10)::DECIMAL(10, 2),
        CURRENT_DATE - (random() * 365)::INTEGER
      FROM generate_series(1, 2000) i;
    `,
    hints: [
      'Use ANALYZE table_name followed by column names in parentheses',
      'Separate column names with commas'
    ],
    explanation: 'You can optimize ANALYZE performance by only analyzing columns that are frequently used in WHERE clauses or joins. This is especially useful for tables with many columns where only a subset is important for query planning.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          allowEmpty: true
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'check-statistics-target',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Default Statistics Target',
    prompt: 'Write a query to check the current value of default_statistics_target.',
    setupSql: '',
    hints: [
      'Use the SHOW command',
      'The parameter name is default_statistics_target'
    ],
    explanation: 'The default_statistics_target parameter controls how much detail is collected by ANALYZE. The default is 100, which means 100 entries in the MCV list and 100 histogram bins. Higher values provide more accurate statistics but take longer to collect.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['default_statistics_target']
          }
        }
      }
    },
    order: 2,
    difficulty: 1
  },
  {
    id: 'identify-stale-statistics',
    lessonId: '',
    type: 'sql-query',
    title: 'Identify Tables with Stale Statistics',
    prompt: 'Write a query to find all user tables where more than 10% of rows have been modified since the last ANALYZE. Show table name, number of live tuples, modifications since analyze, and the percentage changed (rounded to 1 decimal place).',
    setupSql: `
      CREATE TABLE IF NOT EXISTS customers (
        customer_id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255)
      );
      CREATE TABLE IF NOT EXISTS invoices (
        invoice_id SERIAL PRIMARY KEY,
        amount DECIMAL(10, 2)
      );

      INSERT INTO customers (name, email)
      SELECT 'Customer ' || i, 'customer' || i || '@example.com'
      FROM generate_series(1, 1000) i;

      INSERT INTO invoices (amount)
      SELECT (random() * 1000)::DECIMAL(10, 2)
      FROM generate_series(1, 500) i;

      ANALYZE customers;
      ANALYZE invoices;

      -- Add more data to customers to make it stale
      INSERT INTO customers (name, email)
      SELECT 'New Customer ' || i, 'new' || i || '@example.com'
      FROM generate_series(1, 200) i;
    `,
    hints: [
      'Query pg_stat_user_tables view',
      'Calculate percentage as: 100.0 * n_mod_since_analyze / NULLIF(n_live_tup, 0)',
      'Use ROUND() with 1 as the second parameter for 1 decimal place',
      'Filter WHERE n_mod_since_analyze > n_live_tup * 0.1'
    ],
    explanation: 'Monitoring for stale statistics is crucial for maintaining query performance. When a significant percentage of rows have changed since ANALYZE, the query planner may make poor decisions based on outdated information.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
          columns: {
            required: ['relname', 'n_live_tup', 'n_mod_since_analyze', 'pct_changed']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  },
  {
    id: 'check-autovacuum-settings',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Autovacuum Analyze Settings',
    prompt: 'Write a query to show the current values of autovacuum_analyze_threshold and autovacuum_analyze_scale_factor.',
    setupSql: '',
    hints: [
      'Query the pg_settings view',
      'Filter WHERE name IN (\'autovacuum_analyze_threshold\', \'autovacuum_analyze_scale_factor\')',
      'Select name and setting columns'
    ],
    explanation: 'These parameters control when autovacuum automatically runs ANALYZE on a table. A table is analyzed when changes >= threshold + (scale_factor × table_size). Understanding these values helps you predict when statistics will be updated.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 2 },
          columns: {
            required: ['name', 'setting']
          }
        }
      }
    },
    order: 4,
    difficulty: 2
  },
  {
    id: 'calculate-autovacuum-trigger',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate When Autovacuum Will Trigger',
    prompt: 'For the "orders" table, calculate how many changes are needed before autovacuum will run ANALYZE. Use the formula: threshold + (scale_factor × n_live_tup). Show the table name, current live tuples, and the calculated trigger threshold. Assume autovacuum_analyze_threshold=50 and autovacuum_analyze_scale_factor=0.1.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS orders (
        order_id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        total DECIMAL(10, 2)
      );
      INSERT INTO orders (customer_id, total)
      SELECT (random() * 1000)::INTEGER, (random() * 500)::DECIMAL(10, 2)
      FROM generate_series(1, 5000) i;
      ANALYZE orders;
    `,
    hints: [
      'Query pg_stat_user_tables',
      'Calculate: 50 + (0.1 * n_live_tup)',
      'Use ROUND() or ::INTEGER to get a whole number',
      'Filter for relname = \'orders\''
    ],
    explanation: 'Understanding when autovacuum will trigger helps you decide if you need to adjust settings or run manual ANALYZE. For large tables, the default 10% scale factor means many changes are needed before statistics update.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['relname', 'n_live_tup', 'trigger_threshold']
          }
        }
      }
    },
    order: 5,
    difficulty: 3
  }
];
