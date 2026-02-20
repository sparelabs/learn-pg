import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'check-autovacuum-status',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Autovacuum Status',
    prompt: 'Write a query to check if autovacuum is enabled in your PostgreSQL instance.',
    setupSql: '',
    hints: [
      'Use the SHOW command to display configuration settings',
      'The setting name is "autovacuum"'
    ],
    explanation: 'The SHOW command displays the current value of run-time parameters. Autovacuum should typically be enabled (on) to ensure statistics are kept up-to-date automatically.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['autovacuum']
          }
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'analyze-table',
    lessonId: '',
    type: 'sql-query',
    title: 'Run ANALYZE on a Table',
    prompt: 'A table named "products" exists in your database. Write a command to update its statistics using ANALYZE.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        product_id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        category VARCHAR(100),
        price DECIMAL(10, 2),
        stock_quantity INTEGER
      );
      INSERT INTO products (name, category, price, stock_quantity)
      SELECT
        'Product ' || i,
        CASE (i % 5)
          WHEN 0 THEN 'Electronics'
          WHEN 1 THEN 'Clothing'
          WHEN 2 THEN 'Food'
          WHEN 3 THEN 'Books'
          ELSE 'Toys'
        END,
        (random() * 1000)::DECIMAL(10, 2),
        (random() * 100)::INTEGER
      FROM generate_series(1, 1000) i;
    `,
    hints: [
      'Use the ANALYZE command',
      'Specify the table name after ANALYZE'
    ],
    explanation: 'The ANALYZE command collects statistics about the contents of tables. It samples rows from the table and updates the statistics in the system catalogs, which the query planner uses to make better execution decisions.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          // ANALYZE doesn't return rows, so we check it runs successfully
          allowEmpty: true
        }
      }
    },
    order: 2,
    difficulty: 1
  },
  {
    id: 'view-statistics-age',
    lessonId: '',
    type: 'sql-query',
    title: 'View Statistics Age',
    prompt: 'Write a query to see when the "products" table was last analyzed. Include both manual and automatic analyze times.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        product_id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        category VARCHAR(100),
        price DECIMAL(10, 2)
      );
      INSERT INTO products (name, category, price) VALUES ('Test Product', 'Test', 10.00);
      ANALYZE products;
    `,
    hints: [
      'Use the pg_stat_user_tables view',
      'Look for columns named last_analyze and last_autoanalyze',
      'Filter by relname to get the specific table'
    ],
    explanation: 'The pg_stat_user_tables view contains statistics about table access patterns and maintenance operations. The last_analyze and last_autoanalyze columns show when statistics were last updated manually or automatically.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['last_analyze', 'last_autoanalyze']
          }
        }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: 'understand-row-counts',
    lessonId: '',
    type: 'sql-query',
    title: 'Understanding Row Count Statistics',
    prompt: 'Write a query to show the "products" table name, number of live tuples (rows), and number of modifications since last analyze from pg_stat_user_tables.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        product_id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        category VARCHAR(100)
      );
      INSERT INTO products (name, category)
      SELECT 'Product ' || i, 'Category ' || (i % 10)
      FROM generate_series(1, 500) i;
      ANALYZE products;
    `,
    hints: [
      'Query the pg_stat_user_tables view',
      'Select relname, n_live_tup, and n_mod_since_analyze columns',
      'Filter for the products table using WHERE relname = \'products\''
    ],
    explanation: 'The n_live_tup column shows the estimated number of live rows, while n_mod_since_analyze shows how many rows have been inserted, updated, or deleted since the last ANALYZE. When n_mod_since_analyze is high relative to n_live_tup, statistics may be stale.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['relname', 'n_live_tup', 'n_mod_since_analyze']
          }
        }
      }
    },
    order: 4,
    difficulty: 2
  }
];
