import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'create-basic-extended-stats',
    lessonId: '',
    type: 'sql-query',
    title: 'Create Basic Extended Statistics',
    prompt: 'Create extended statistics named "stats_address_location" on the city, state, and country columns of the "addresses" table. Include all statistic types (dependencies, ndistinct, mcv).',
    setupSql: `
      CREATE TABLE IF NOT EXISTS addresses (
        address_id SERIAL PRIMARY KEY,
        street VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(50),
        country VARCHAR(50),
        zip_code VARCHAR(20)
      );
      INSERT INTO addresses (street, city, state, country, zip_code)
      SELECT
        i || ' Main Street',
        CASE (i % 20)
          WHEN 0 THEN 'San Francisco'
          WHEN 1 THEN 'Los Angeles'
          WHEN 2 THEN 'New York'
          WHEN 3 THEN 'Chicago'
          WHEN 4 THEN 'Houston'
          ELSE 'Other City ' || (i % 20)
        END,
        CASE
          WHEN (i % 20) < 2 THEN 'California'
          WHEN (i % 20) = 2 THEN 'New York'
          WHEN (i % 20) = 3 THEN 'Illinois'
          WHEN (i % 20) = 4 THEN 'Texas'
          ELSE 'State ' || (i % 10)
        END,
        CASE
          WHEN (i % 20) < 5 THEN 'USA'
          ELSE 'Country ' || (i % 5)
        END,
        LPAD((i % 99999)::TEXT, 5, '0')
      FROM generate_series(1, 2000) i;
    `,
    hints: [
      'Use CREATE STATISTICS statement',
      'Syntax: CREATE STATISTICS name (types) ON columns FROM table',
      'Types are: dependencies, ndistinct, mcv',
      'Don\'t forget to run ANALYZE afterwards'
    ],
    explanation: 'Extended statistics capture relationships between multiple columns. Dependencies track functional relationships, ndistinct counts unique combinations, and mcv tracks common value combinations. These help the planner make better estimates for multi-column predicates.',
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
    difficulty: 3
  },
  {
    id: 'list-extended-statistics',
    lessonId: '',
    type: 'sql-query',
    title: 'List Extended Statistics',
    prompt: 'Query pg_statistic_ext to list all extended statistics for user tables in the public schema. Show the statistics name and the table it belongs to.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS orders (
        order_id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        product_id INTEGER,
        status VARCHAR(50)
      );
      INSERT INTO orders (customer_id, product_id, status)
      SELECT
        (random() * 100)::INTEGER,
        (random() * 50)::INTEGER,
        CASE (random() * 2)::INTEGER
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'completed'
          ELSE 'cancelled'
        END
      FROM generate_series(1, 1000) i;
      CREATE STATISTICS stats_orders_combo (ndistinct, mcv)
      ON customer_id, product_id FROM orders;
      ANALYZE orders;
    `,
    hints: [
      'Query pg_statistic_ext view',
      'Use stxname for statistics name',
      'Use stxrelid::regclass to convert OID to table name',
      'Filter stxnamespace::regnamespace = \'public\' for public schema'
    ],
    explanation: 'The pg_statistic_ext catalog table stores metadata about extended statistics. You can query it to see what extended statistics exist, which tables they cover, and what types of statistics are collected.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
          columns: {
            required: ['stxname', 'table_name']
          }
        }
      }
    },
    order: 2,
    difficulty: 3
  },
  {
    id: 'ndistinct-statistics',
    lessonId: '',
    type: 'sql-query',
    title: 'Create N-Distinct Statistics',
    prompt: 'Create extended statistics named "stats_products_category" with only ndistinct statistics on the category and subcategory columns of the "products" table.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        product_id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        category VARCHAR(100),
        subcategory VARCHAR(100),
        price DECIMAL(10, 2)
      );
      INSERT INTO products (name, category, subcategory, price)
      SELECT
        'Product ' || i,
        CASE (i % 5)
          WHEN 0 THEN 'Electronics'
          WHEN 1 THEN 'Clothing'
          WHEN 2 THEN 'Books'
          WHEN 3 THEN 'Food'
          ELSE 'Toys'
        END,
        CASE (i % 15)
          WHEN 0 THEN 'Laptops'
          WHEN 1 THEN 'Phones'
          WHEN 2 THEN 'Tablets'
          WHEN 3 THEN 'Shirts'
          WHEN 4 THEN 'Pants'
          WHEN 5 THEN 'Fiction'
          WHEN 6 THEN 'Non-Fiction'
          WHEN 7 THEN 'Snacks'
          WHEN 8 THEN 'Beverages'
          ELSE 'Other'
        END,
        (random() * 500 + 10)::DECIMAL(10, 2)
      FROM generate_series(1, 1500) i;
    `,
    hints: [
      'Use CREATE STATISTICS with only (ndistinct)',
      'Syntax: CREATE STATISTICS name (ndistinct) ON col1, col2 FROM table'
    ],
    explanation: 'N-distinct statistics help when columns are correlated in their distinct value counts. For example, subcategories only exist within categories, so the distinct combinations are fewer than multiplying individual distinct counts.',
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
    id: 'dependency-statistics',
    lessonId: '',
    type: 'sql-query',
    title: 'Create Dependency Statistics',
    prompt: 'Create extended statistics named "stats_location_deps" with only dependencies on zip_code, city, state, and country columns of the "locations" table.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS locations (
        location_id SERIAL PRIMARY KEY,
        zip_code VARCHAR(10),
        city VARCHAR(100),
        state VARCHAR(50),
        country VARCHAR(50)
      );
      INSERT INTO locations (zip_code, city, state, country)
      SELECT
        LPAD((10000 + i)::TEXT, 5, '0'),
        CASE (i % 10)
          WHEN 0 THEN 'New York'
          WHEN 1 THEN 'Los Angeles'
          WHEN 2 THEN 'Chicago'
          WHEN 3 THEN 'Houston'
          WHEN 4 THEN 'Phoenix'
          ELSE 'City ' || (i % 10)
        END,
        CASE (i % 10)
          WHEN 0 THEN 'New York'
          WHEN 1 THEN 'California'
          WHEN 2 THEN 'Illinois'
          WHEN 3 THEN 'Texas'
          WHEN 4 THEN 'Arizona'
          ELSE 'State ' || (i % 10)
        END,
        'USA'
      FROM generate_series(1, 1000) i;
    `,
    hints: [
      'Use CREATE STATISTICS with only (dependencies)',
      'List all four columns: zip_code, city, state, country'
    ],
    explanation: 'Dependency statistics capture functional dependencies like "zip_code determines city" or "city determines state". This helps the planner understand that filtering by zip_code also constrains the city, state, and country.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          allowEmpty: true
        }
      }
    },
    order: 4,
    difficulty: 3
  },
  {
    id: 'mcv-statistics',
    lessonId: '',
    type: 'sql-query',
    title: 'Create Multi-Column MCV Statistics',
    prompt: 'Create extended statistics named "stats_sessions_device" with only mcv (most common values) on device_type and browser columns of the "user_sessions" table.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id SERIAL PRIMARY KEY,
        user_id INTEGER,
        device_type VARCHAR(50),
        browser VARCHAR(50),
        session_start TIMESTAMP
      );
      INSERT INTO user_sessions (user_id, device_type, browser, session_start)
      SELECT
        (random() * 500)::INTEGER,
        CASE (random() * 100)::INTEGER
          WHEN 0 TO 59 THEN 'mobile'
          WHEN 60 TO 89 THEN 'desktop'
          ELSE 'tablet'
        END,
        CASE
          WHEN (random() * 100)::INTEGER < 40 THEN 'chrome'
          WHEN (random() * 100)::INTEGER < 70 THEN 'safari'
          WHEN (random() * 100)::INTEGER < 90 THEN 'firefox'
          ELSE 'edge'
        END,
        NOW() - (random() * 30 || ' days')::INTERVAL
      FROM generate_series(1, 2000) i;
    `,
    hints: [
      'Use CREATE STATISTICS with only (mcv)',
      'Include device_type and browser columns'
    ],
    explanation: 'Multi-column MCV statistics capture common value combinations. For example, (mobile, safari) might be very common while (mobile, edge) is rare. This provides better estimates than assuming independence.',
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
    difficulty: 3
  },
  {
    id: 'drop-extended-statistics',
    lessonId: '',
    type: 'sql-query',
    title: 'Drop Extended Statistics',
    prompt: 'Drop the extended statistics named "stats_old_correlation" if it exists.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS test_table (
        id SERIAL PRIMARY KEY,
        col_a INTEGER,
        col_b INTEGER
      );
      CREATE STATISTICS stats_old_correlation (ndistinct)
      ON col_a, col_b FROM test_table;
    `,
    hints: [
      'Use DROP STATISTICS statement',
      'Add IF EXISTS to avoid errors if it doesn\'t exist'
    ],
    explanation: 'Extended statistics can be dropped when no longer needed. This is useful when cleaning up unused statistics or when column structures change.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          allowEmpty: true
        }
      }
    },
    order: 6,
    difficulty: 2
  },
  {
    id: 'verify-extended-stats-usage',
    lessonId: '',
    type: 'sql-query',
    title: 'Verify Extended Statistics Exist',
    prompt: 'Query pg_statistic_ext to verify that extended statistics exist for the "orders" table. Show the statistics name, the types of statistics collected (stxkind), and the table name.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS orders (
        order_id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        payment_method VARCHAR(50),
        status VARCHAR(50)
      );
      INSERT INTO orders (customer_id, payment_method, status)
      SELECT
        (random() * 200)::INTEGER,
        CASE (random() * 2)::INTEGER
          WHEN 0 THEN 'credit_card'
          WHEN 1 THEN 'paypal'
          ELSE 'bank_transfer'
        END,
        CASE (random() * 2)::INTEGER
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'completed'
          ELSE 'cancelled'
        END
      FROM generate_series(1, 1500) i;
      CREATE STATISTICS stats_orders_payment (dependencies, mcv)
      ON payment_method, status FROM orders;
      ANALYZE orders;
    `,
    hints: [
      'Query pg_statistic_ext',
      'Filter WHERE stxrelid = \'orders\'::regclass',
      'Use stxrelid::regclass to show table name',
      'Include stxname and stxkind columns'
    ],
    explanation: 'After creating extended statistics, you should verify they exist and were properly created. The stxkind column shows which types of statistics were collected (d=dependencies, f=ndistinct, m=mcv).',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
          columns: {
            required: ['stxname', 'stxkind', 'table_name']
          }
        }
      }
    },
    order: 7,
    difficulty: 3
  }
];
