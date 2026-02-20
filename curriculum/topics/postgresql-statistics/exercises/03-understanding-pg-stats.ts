import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'explore-pg-stats-basic',
    lessonId: '',
    type: 'sql-query',
    title: 'Explore Basic Column Statistics',
    prompt: 'Query pg_stats for the "products" table to see the column name, null fraction, average width, and number of distinct values for all columns. Order by column name.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        product_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        price DECIMAL(10, 2),
        in_stock BOOLEAN
      );
      INSERT INTO products (name, description, category, price, in_stock)
      SELECT
        'Product ' || i,
        CASE WHEN random() < 0.3 THEN NULL ELSE 'Description for product ' || i END,
        CASE (i % 5)
          WHEN 0 THEN 'Electronics'
          WHEN 1 THEN 'Clothing'
          WHEN 2 THEN 'Food'
          WHEN 3 THEN 'Books'
          ELSE 'Toys'
        END,
        (random() * 1000 + 10)::DECIMAL(10, 2),
        random() > 0.2
      FROM generate_series(1, 1000) i;
      ANALYZE products;
    `,
    hints: [
      'SELECT from pg_stats view',
      'Include attname, null_frac, avg_width, n_distinct columns',
      'WHERE tablename = \'products\'',
      'ORDER BY attname'
    ],
    explanation: 'The pg_stats view provides a human-readable interface to column statistics. null_frac shows the fraction of NULL values, avg_width shows average byte size, and n_distinct shows the number of unique values (or -1 for unique columns).',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 4 },
          columns: {
            required: ['attname', 'null_frac', 'avg_width', 'n_distinct']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'understand-null-fraction',
    lessonId: '',
    type: 'sql-query',
    title: 'Understanding NULL Fraction',
    prompt: 'Query pg_stats for the "users" table to find columns with more than 10% NULL values. Show the column name and NULL fraction as a percentage (rounded to 2 decimal places). Order by null_frac descending.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        middle_name VARCHAR(100),
        bio TEXT,
        verified_at TIMESTAMP
      );
      INSERT INTO users (email, phone, middle_name, bio, verified_at)
      SELECT
        'user' || i || '@example.com',
        CASE WHEN random() < 0.25 THEN NULL ELSE '555-' || LPAD(i::TEXT, 7, '0') END,
        CASE WHEN random() < 0.65 THEN NULL ELSE 'Middle' || i END,
        CASE WHEN random() < 0.40 THEN NULL ELSE 'Bio for user ' || i END,
        CASE WHEN random() < 0.30 THEN NULL ELSE NOW() - (random() * 365 || ' days')::INTERVAL END
      FROM generate_series(1, 2000) i;
      ANALYZE users;
    `,
    hints: [
      'Query pg_stats WHERE tablename = \'users\'',
      'Calculate percentage: null_frac * 100',
      'Use ROUND(value, 2) for 2 decimal places',
      'Filter WHERE null_frac > 0.1',
      'ORDER BY null_frac DESC'
    ],
    explanation: 'NULL fraction affects query planning for IS NULL and IS NOT NULL predicates. High null_frac values indicate columns where NULL is common, which the planner uses to estimate selectivity.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 2 },
          columns: {
            required: ['attname', 'null_pct']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'explore-most-common-values',
    lessonId: '',
    type: 'sql-query',
    title: 'Examine Most Common Values',
    prompt: 'Query pg_stats to see the most common values and their frequencies for the "status" column in the "orders" table.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS orders (
        order_id SERIAL PRIMARY KEY,
        status VARCHAR(50),
        priority VARCHAR(20)
      );
      INSERT INTO orders (status, priority)
      SELECT
        CASE (random() * 100)::INTEGER
          WHEN 0 TO 44 THEN 'pending'
          WHEN 45 TO 74 THEN 'processing'
          WHEN 75 TO 89 THEN 'shipped'
          WHEN 90 TO 97 THEN 'delivered'
          ELSE 'cancelled'
        END,
        CASE (random() * 2)::INTEGER
          WHEN 0 THEN 'low'
          WHEN 1 THEN 'medium'
          ELSE 'high'
        END
      FROM generate_series(1, 5000) i;
      ANALYZE orders;
    `,
    hints: [
      'SELECT attname, most_common_vals, most_common_freqs FROM pg_stats',
      'WHERE tablename = \'orders\' AND attname = \'status\''
    ],
    explanation: 'Most Common Values (MCV) lists show the frequently occurring values and their frequencies. The query planner uses this to accurately estimate selectivity for WHERE clauses with specific values.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['attname', 'most_common_vals', 'most_common_freqs']
          }
        }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: 'analyze-correlation',
    lessonId: '',
    type: 'sql-query',
    title: 'Understand Column Correlation',
    prompt: 'Query pg_stats to show column name and correlation for all columns in the "events" table. Order by the absolute value of correlation descending to see which columns are most correlated with physical storage order.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS events (
        event_id SERIAL PRIMARY KEY,
        event_date DATE,
        event_type VARCHAR(50),
        user_id INTEGER
      );
      INSERT INTO events (event_date, event_type, user_id)
      SELECT
        CURRENT_DATE - (i / 10)::INTEGER,
        CASE (random() * 3)::INTEGER
          WHEN 0 THEN 'login'
          WHEN 1 THEN 'purchase'
          ELSE 'logout'
        END,
        (random() * 1000)::INTEGER
      FROM generate_series(1, 3000) i;
      ANALYZE events;
    `,
    hints: [
      'SELECT attname, correlation FROM pg_stats',
      'WHERE tablename = \'events\'',
      'ORDER BY ABS(correlation) DESC to sort by absolute value',
      'NULLS LAST to handle columns without correlation stats'
    ],
    explanation: 'Correlation measures how well physical row order matches logical column order. Values near 1.0 or -1.0 indicate strong correlation, making index scans more efficient. Values near 0 indicate random order, which may make sequential scans preferable for range queries.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 3 },
          columns: {
            required: ['attname', 'correlation']
          }
        }
      }
    },
    order: 4,
    difficulty: 3
  },
  {
    id: 'histogram-bounds-exploration',
    lessonId: '',
    type: 'sql-query',
    title: 'Explore Histogram Bounds',
    prompt: 'Query pg_stats to show the column name and number of histogram buckets for numeric/date columns in the "sales" table. Use array_length() to count histogram buckets.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS sales (
        sale_id SERIAL PRIMARY KEY,
        sale_date DATE,
        amount DECIMAL(10, 2),
        quantity INTEGER,
        region VARCHAR(50)
      );
      INSERT INTO sales (sale_date, amount, quantity, region)
      SELECT
        CURRENT_DATE - (random() * 730)::INTEGER,
        (random() * 10000 + 100)::DECIMAL(10, 2),
        (random() * 50 + 1)::INTEGER,
        CASE (random() * 3)::INTEGER
          WHEN 0 THEN 'North'
          WHEN 1 THEN 'South'
          ELSE 'East'
        END
      FROM generate_series(1, 2000) i;
      ANALYZE sales;
    `,
    hints: [
      'SELECT attname and array_length(histogram_bounds, 1) FROM pg_stats',
      'WHERE tablename = \'sales\'',
      'Filter where histogram_bounds IS NOT NULL',
      'Use AS to name the array_length result'
    ],
    explanation: 'Histogram bounds divide the range of non-MCV values into equal-frequency buckets. The number of buckets is controlled by the statistics target. More buckets provide finer granularity for range query estimates.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 3 },
          columns: {
            required: ['attname', 'num_buckets']
          }
        }
      }
    },
    order: 5,
    difficulty: 3
  },
  {
    id: 'find-skewed-distributions',
    lessonId: '',
    type: 'sql-query',
    title: 'Identify Skewed Data Distributions',
    prompt: 'Find columns with highly skewed distributions by querying pg_stats for columns where the most common value appears in more than 40% of rows. Show schema, table, column name, the top value, and its frequency percentage (rounded to 1 decimal).',
    setupSql: `
      CREATE TABLE IF NOT EXISTS transactions (
        transaction_id SERIAL PRIMARY KEY,
        status VARCHAR(50),
        payment_method VARCHAR(50),
        currency VARCHAR(3)
      );
      INSERT INTO transactions (status, payment_method, currency)
      SELECT
        CASE (random() * 100)::INTEGER
          WHEN 0 TO 79 THEN 'completed'
          WHEN 80 TO 90 THEN 'pending'
          ELSE 'failed'
        END,
        CASE (random() * 100)::INTEGER
          WHEN 0 TO 69 THEN 'credit_card'
          WHEN 70 TO 85 THEN 'paypal'
          ELSE 'bank_transfer'
        END,
        CASE (random() * 100)::INTEGER
          WHEN 0 TO 85 THEN 'USD'
          WHEN 86 TO 93 THEN 'EUR'
          ELSE 'GBP'
        END
      FROM generate_series(1, 3000) i;
      ANALYZE transactions;
    `,
    hints: [
      'Query pg_stats and access most_common_freqs[1] for the top frequency',
      'Filter WHERE most_common_freqs[1] > 0.4',
      'Multiply frequency by 100 for percentage',
      'Access most_common_vals[1] for the top value'
    ],
    explanation: 'Highly skewed distributions where one value dominates can affect query performance. Understanding these patterns helps with index decisions and may indicate the need for extended statistics or partial indexes.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 2 },
          columns: {
            required: ['schemaname', 'tablename', 'attname', 'top_value', 'frequency_pct']
          }
        }
      }
    },
    order: 6,
    difficulty: 4
  }
];
