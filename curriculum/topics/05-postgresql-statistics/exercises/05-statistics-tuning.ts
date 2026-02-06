import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'set-column-statistics-target',
    lessonId: '',
    type: 'sql-query',
    title: 'Set Column Statistics Target',
    prompt: 'Set the statistics target to 500 for the customer_id column in the "orders" table.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS orders (
        order_id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        product_id INTEGER,
        order_date DATE,
        total_amount DECIMAL(10, 2)
      );
      INSERT INTO orders (customer_id, product_id, order_date, total_amount)
      SELECT
        (random() * 5000)::INTEGER,
        (random() * 200)::INTEGER,
        CURRENT_DATE - (random() * 365)::INTEGER,
        (random() * 1000 + 10)::DECIMAL(10, 2)
      FROM generate_series(1, 10000) i;
    `,
    hints: [
      'Use ALTER TABLE ... ALTER COLUMN ... SET STATISTICS',
      'Syntax: ALTER TABLE table_name ALTER COLUMN column_name SET STATISTICS target'
    ],
    explanation: 'Increasing the statistics target for a column provides more detailed statistics, including more MCV entries and histogram buckets. This is especially useful for high-cardinality columns used in joins or WHERE clauses.',
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
    id: 'view-column-statistics-targets',
    lessonId: '',
    type: 'sql-query',
    title: 'View Column Statistics Targets',
    prompt: 'Write a query to show all columns in the "products" table along with their statistics targets. Show table name, column name, and the effective statistics target (use default_statistics_target when column-specific target is -1).',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        product_id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        category_id INTEGER,
        price DECIMAL(10, 2),
        description TEXT
      );
      ALTER TABLE products ALTER COLUMN category_id SET STATISTICS 300;
      INSERT INTO products (name, category_id, price, description)
      SELECT
        'Product ' || i,
        (random() * 50)::INTEGER,
        (random() * 500)::DECIMAL(10, 2),
        'Description ' || i
      FROM generate_series(1, 1000) i;
    `,
    hints: [
      'Join pg_attribute with pg_class and pg_namespace',
      'Use attstattarget column (value of -1 means use default)',
      'Get default with: (SELECT setting::int FROM pg_settings WHERE name = \'default_statistics_target\')',
      'Use CASE to show default when attstattarget = -1',
      'Filter for attnum > 0 and NOT attisdropped'
    ],
    explanation: 'Monitoring statistics targets helps you understand which columns have custom statistics collection settings. A value of -1 means the column uses the database default_statistics_target.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 4 },
          columns: {
            required: ['table_name', 'column_name', 'statistics_target']
          }
        }
      }
    },
    order: 2,
    difficulty: 4
  },
  {
    id: 'configure-table-autovacuum',
    lessonId: '',
    type: 'sql-query',
    title: 'Configure Per-Table Autovacuum',
    prompt: 'Configure the "activity_log" table to have more aggressive auto-analyze by setting autovacuum_analyze_scale_factor to 0.05 and autovacuum_analyze_threshold to 500.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS activity_log (
        log_id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action VARCHAR(100),
        timestamp TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO activity_log (user_id, action)
      SELECT
        (random() * 1000)::INTEGER,
        CASE (random() * 4)::INTEGER
          WHEN 0 THEN 'login'
          WHEN 1 THEN 'logout'
          WHEN 2 THEN 'view_page'
          ELSE 'click_button'
        END
      FROM generate_series(1, 5000) i;
    `,
    hints: [
      'Use ALTER TABLE ... SET',
      'Set both parameters in one statement with comma separation',
      'Syntax: ALTER TABLE table SET (param1 = value1, param2 = value2)'
    ],
    explanation: 'Per-table autovacuum settings override global settings. This is useful for frequently updated tables that need more responsive statistics updates, or for rarely updated tables where less frequent analysis is acceptable.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          allowEmpty: true
        }
      }
    },
    order: 3,
    difficulty: 3
  },
  {
    id: 'find-tables-needing-tuning',
    lessonId: '',
    type: 'sql-query',
    title: 'Identify Tables Needing Statistics Tuning',
    prompt: 'Find all tables in the public schema with more than 10,000 rows that would need more than 1 million changes before autovacuum triggers ANALYZE (using default settings of threshold=50, scale_factor=0.1). Show table name, row count, and calculated trigger point.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS large_events (
        event_id SERIAL PRIMARY KEY,
        event_type VARCHAR(50),
        data JSONB
      );
      CREATE TABLE IF NOT EXISTS huge_logs (
        log_id SERIAL PRIMARY KEY,
        message TEXT
      );
      CREATE TABLE IF NOT EXISTS massive_facts (
        fact_id SERIAL PRIMARY KEY,
        value INTEGER
      );

      -- Simulate large tables
      INSERT INTO large_events (event_type, data)
      SELECT
        'event_' || (i % 10),
        ('{"key": ' || i || '}')::JSONB
      FROM generate_series(1, 15000) i;

      INSERT INTO huge_logs (message)
      SELECT 'Log message ' || i
      FROM generate_series(1, 12000000) i
      WHERE i <= 50;  -- Actually small to keep test fast, but we'll update stats

      ANALYZE large_events;
      ANALYZE huge_logs;

      -- Manually update stats to simulate large table
      UPDATE pg_class SET reltuples = 12000000 WHERE relname = 'huge_logs';
    `,
    hints: [
      'Query pg_stat_user_tables or pg_class for row counts',
      'Calculate trigger point: 50 + (0.1 * n_live_tup)',
      'Filter WHERE n_live_tup > 10000',
      'Filter WHERE trigger point > 1000000'
    ],
    explanation: 'Large tables with default autovacuum settings may need millions of changes before statistics update. Identifying these tables helps you tune autovacuum_analyze_scale_factor to ensure timely statistics updates.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 0 },
          columns: {
            required: ['table_name', 'row_count', 'trigger_point']
          }
        }
      }
    },
    order: 4,
    difficulty: 4
  },
  {
    id: 'reset-statistics-target',
    lessonId: '',
    type: 'sql-query',
    title: 'Reset Statistics Target to Default',
    prompt: 'Reset the statistics target for the "price" column in the "items" table back to the default value.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS items (
        item_id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        price DECIMAL(10, 2)
      );
      ALTER TABLE items ALTER COLUMN price SET STATISTICS 1000;
      INSERT INTO items (name, price)
      SELECT 'Item ' || i, (random() * 100)::DECIMAL(10, 2)
      FROM generate_series(1, 500) i;
    `,
    hints: [
      'Use ALTER TABLE ... ALTER COLUMN ... SET STATISTICS',
      'Use -1 to reset to default',
      'Syntax: ALTER TABLE table ALTER COLUMN column SET STATISTICS -1'
    ],
    explanation: 'Setting a column\'s statistics target to -1 resets it to use the database default_statistics_target. This is useful when you want to remove custom settings and use the default behavior.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          allowEmpty: true
        }
      }
    },
    order: 5,
    difficulty: 2
  },
  {
    id: 'comprehensive-statistics-health',
    lessonId: '',
    type: 'sql-query',
    title: 'Comprehensive Statistics Health Report',
    prompt: 'Create a comprehensive statistics health report showing: table name, row count, modifications since analyze, percent changed (rounded to 1 decimal), last analyze time, and days since last analyze. Filter for tables with more than 100 rows and order by percent changed descending.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS orders (
        order_id SERIAL PRIMARY KEY,
        total DECIMAL(10, 2)
      );
      CREATE TABLE IF NOT EXISTS customers (
        customer_id SERIAL PRIMARY KEY,
        name VARCHAR(255)
      );
      CREATE TABLE IF NOT EXISTS products (
        product_id SERIAL PRIMARY KEY,
        name VARCHAR(255)
      );

      INSERT INTO orders (total)
      SELECT (random() * 500)::DECIMAL(10, 2)
      FROM generate_series(1, 1000) i;

      INSERT INTO customers (name)
      SELECT 'Customer ' || i
      FROM generate_series(1, 500) i;

      INSERT INTO products (name)
      SELECT 'Product ' || i
      FROM generate_series(1, 300) i;

      ANALYZE orders;
      ANALYZE customers;
      ANALYZE products;

      -- Add changes to some tables
      INSERT INTO orders (total) SELECT (random() * 500)::DECIMAL(10, 2)
      FROM generate_series(1, 150) i;

      INSERT INTO customers (name) SELECT 'New Customer ' || i
      FROM generate_series(1, 200) i;
    `,
    hints: [
      'Query pg_stat_user_tables',
      'Calculate pct_changed: 100.0 * n_mod_since_analyze / NULLIF(n_live_tup, 0)',
      'Use COALESCE(last_analyze, last_autoanalyze) for last analyze time',
      'Calculate days: EXTRACT(DAY FROM age(now(), COALESCE(...)))',
      'Use ROUND() for 1 decimal place'
    ],
    explanation: 'A comprehensive health report helps identify tables with stale statistics that may need manual ANALYZE or autovacuum tuning. Monitoring percentage changed and time since last analyze are key metrics for statistics health.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 2 },
          columns: {
            required: ['table_name', 'row_count', 'mods_since_analyze', 'pct_changed', 'last_analyzed', 'days_since_analyze']
          }
        }
      }
    },
    order: 6,
    difficulty: 4
  },
  {
    id: 'monitor-analyze-performance',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Statistics Collection Configuration',
    prompt: 'Write a query to show the current values of key statistics-related configuration parameters: default_statistics_target, autovacuum_analyze_threshold, and autovacuum_analyze_scale_factor. Show parameter name and current setting.',
    setupSql: '',
    hints: [
      'Query pg_settings view',
      'Filter WHERE name IN (...) with the three parameter names',
      'Select name and setting columns'
    ],
    explanation: 'Understanding your current configuration helps you tune statistics collection. These three parameters control how much detail is collected (default_statistics_target) and when auto-analyze triggers (threshold and scale_factor).',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 3 },
          columns: {
            required: ['name', 'setting']
          }
        }
      }
    },
    order: 7,
    difficulty: 2
  },
  {
    id: 'calculate-optimal-scale-factor',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate Recommended Scale Factor',
    prompt: 'For tables larger than 1 million rows, calculate a recommended autovacuum_analyze_scale_factor that would trigger after approximately 100,000 changes (ignoring threshold). Show table name, current row count, and the recommended scale_factor (rounded to 4 decimals).',
    setupSql: `
      CREATE TABLE IF NOT EXISTS big_table_1 (id SERIAL PRIMARY KEY, data TEXT);
      CREATE TABLE IF NOT EXISTS big_table_2 (id SERIAL PRIMARY KEY, data TEXT);

      -- Simulate large tables by updating pg_class
      INSERT INTO big_table_1 (data) SELECT 'test' FROM generate_series(1, 10) i;
      INSERT INTO big_table_2 (data) SELECT 'test' FROM generate_series(1, 10) i;

      ANALYZE big_table_1;
      ANALYZE big_table_2;

      UPDATE pg_class SET reltuples = 5000000 WHERE relname = 'big_table_1';
      UPDATE pg_class SET reltuples = 2000000 WHERE relname = 'big_table_2';
    `,
    hints: [
      'Query pg_class for reltuples (row count)',
      'Calculate: 100000 / reltuples (this gives the scale factor)',
      'Filter WHERE reltuples > 1000000',
      'Use ROUND(value, 4) for 4 decimal places',
      'Join with pg_namespace to filter for public schema'
    ],
    explanation: 'For very large tables, the default 0.1 scale factor means millions of changes before auto-analyze triggers. Calculating a custom scale factor based on absolute change counts (like 100k changes) provides more responsive statistics updates.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 2 },
          columns: {
            required: ['table_name', 'row_count', 'recommended_scale_factor']
          }
        }
      }
    },
    order: 8,
    difficulty: 4
  }
];
