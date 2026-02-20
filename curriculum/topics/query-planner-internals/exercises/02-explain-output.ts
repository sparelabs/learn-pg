import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'basic-explain',
    lessonId: '',
    type: 'sql-query',
    title: 'Basic EXPLAIN',
    prompt: 'Use EXPLAIN to show the query plan for selecting all rows from the products table where price > 100. Do not execute the query.',
    setupSql: `
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name TEXT,
        price NUMERIC
      );
      INSERT INTO products (name, price)
      SELECT 'Product ' || i, 10 + (random() * 200)::numeric
      FROM generate_series(1, 1000) i;
      ANALYZE products;
    `,
    hints: [
      'Start with the EXPLAIN keyword',
      'Follow with your SELECT query',
      'Filter with WHERE price > 100'
    ],
    explanation: 'EXPLAIN shows the query plan without executing the query. It displays estimated costs, row counts, and the chosen scan method. This is useful for understanding how PostgreSQL will execute your query.',
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
    order: 1,
    difficulty: 1
  },
  {
    id: 'explain-analyze',
    lessonId: '',
    type: 'sql-query',
    title: 'EXPLAIN ANALYZE',
    prompt: 'Use EXPLAIN ANALYZE to show both the plan and actual execution statistics for selecting products where price < 50.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT,
        price NUMERIC
      );
      TRUNCATE products;
      INSERT INTO products (name, price)
      SELECT 'Product ' || i, 10 + (random() * 200)::numeric
      FROM generate_series(1, 1000) i;
      ANALYZE products;
    `,
    hints: [
      'Use EXPLAIN ANALYZE instead of just EXPLAIN',
      'This will actually execute the query',
      'Filter WHERE price < 50'
    ],
    explanation: 'EXPLAIN ANALYZE executes the query and shows actual timings alongside estimates. This reveals how accurate the planners estimates are and where time is actually spent. Be careful using this with INSERT/UPDATE/DELETE as it will modify data.',
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
    order: 2,
    difficulty: 2
  },
  {
    id: 'explain-json-format',
    lessonId: '',
    type: 'sql-query',
    title: 'JSON Format EXPLAIN',
    prompt: 'Use EXPLAIN with FORMAT JSON to output the query plan in JSON format for the query: SELECT COUNT(*) FROM products.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT,
        price NUMERIC
      );
      TRUNCATE products;
      INSERT INTO products (name, price)
      SELECT 'Product ' || i, 10 + (random() * 200)::numeric
      FROM generate_series(1, 1000) i;
    `,
    hints: [
      'Use EXPLAIN with options in parentheses',
      'The format is specified as (FORMAT JSON)',
      'Follow with SELECT COUNT(*) FROM products'
    ],
    explanation: 'EXPLAIN can output plans in different formats: TEXT (default), JSON, YAML, or XML. JSON format is useful for programmatic analysis or integration with monitoring tools.',
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
  }
];
