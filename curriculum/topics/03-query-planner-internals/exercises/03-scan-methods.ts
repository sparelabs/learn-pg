import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'identify-seq-scan',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Sequential Scan',
    prompt: 'Use EXPLAIN to show the plan for selecting all products where price > 50. This should show a Sequential Scan.',
    setupSql: `
      DROP TABLE IF EXISTS products CASCADE;
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
      'Use EXPLAIN before your SELECT',
      'Query all columns from products',
      'Filter WHERE price > 50',
      'Look for "Seq Scan" in the output'
    ],
    explanation: 'Sequential Scan reads every row in the table. It is chosen when no suitable index exists or when the query will return a large percentage of rows. For this query with no index on price, PostgreSQL performs a sequential scan.',
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
    id: 'create-index-for-scan',
    lessonId: '',
    type: 'sql-query',
    title: 'Create Index to Enable Index Scan',
    prompt: 'Create an index on the price column of the products table called idx_products_price.',
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
      DROP INDEX IF EXISTS idx_products_price;
    `,
    hints: [
      'Use CREATE INDEX syntax',
      'Name it idx_products_price',
      'Create it on the price column of products table'
    ],
    explanation: 'Creating an index on the price column allows PostgreSQL to use an Index Scan for selective queries. This is much faster than scanning the entire table when you are looking for specific values or ranges.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 0 }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'observe-index-scan',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Index Scan',
    prompt: 'After creating the index, use EXPLAIN to show the plan for selecting products where price = 50. This should show an Index Scan.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT,
        price NUMERIC
      );
      TRUNCATE products;
      INSERT INTO products (name, price)
      SELECT 'Product ' || i, (i % 200) + 10
      FROM generate_series(1, 1000) i;
      DROP INDEX IF EXISTS idx_products_price;
      CREATE INDEX idx_products_price ON products(price);
      ANALYZE products;
    `,
    hints: [
      'Use EXPLAIN to see the plan',
      'Query products WHERE price = 50',
      'Look for "Index Scan" using idx_products_price'
    ],
    explanation: 'With an index on the price column and a selective query (equality condition), PostgreSQL will use an Index Scan. This is more efficient than a Sequential Scan because it can quickly locate matching rows through the B-tree index.',
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
  },
  {
    id: 'index-only-scan-setup',
    lessonId: '',
    type: 'sql-query',
    title: 'Create Covering Index',
    prompt: 'Create an index on (price, name) for the products table called idx_products_price_name to enable Index Only Scans.',
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
      DROP INDEX IF EXISTS idx_products_price_name;
    `,
    hints: [
      'CREATE INDEX with multiple columns',
      'Include both price and name columns',
      'Name it idx_products_price_name'
    ],
    explanation: 'A covering index (or composite index) contains all columns needed by a query. This allows PostgreSQL to retrieve data entirely from the index without accessing the table heap, resulting in an Index Only Scan.',
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
    difficulty: 2
  },
  {
    id: 'observe-index-only-scan',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Index Only Scan',
    prompt: 'Use EXPLAIN to show the plan for selecting only price and name from products where price > 100. After the covering index and VACUUM, this may show an Index Only Scan.',
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
      DROP INDEX IF EXISTS idx_products_price_name;
      CREATE INDEX idx_products_price_name ON products(price, name);
      VACUUM products;
      ANALYZE products;
    `,
    hints: [
      'SELECT only price and name columns',
      'Filter WHERE price > 100',
      'Use EXPLAIN to see if it uses Index Only Scan'
    ],
    explanation: 'Index Only Scan is possible when all columns in SELECT and WHERE are in the index and the visibility map is up-to-date (via VACUUM). This is the most efficient scan method as it never accesses the table heap.',
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
    order: 5,
    difficulty: 3
  },
  {
    id: 'observe-bitmap-scan',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Bitmap Heap Scan',
    prompt: 'Use EXPLAIN to show the plan for selecting products where price BETWEEN 80 AND 120. This may show a Bitmap Heap Scan with moderate selectivity.',
    setupSql: `
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT,
        price NUMERIC
      );
      TRUNCATE products;
      INSERT INTO products (name, price)
      SELECT 'Product ' || i, 10 + (random() * 200)::numeric
      FROM generate_series(1, 5000) i;
      DROP INDEX IF EXISTS idx_products_price;
      CREATE INDEX idx_products_price ON products(price);
      ANALYZE products;
    `,
    hints: [
      'Use EXPLAIN on the SELECT query',
      'Filter WHERE price BETWEEN 80 AND 120',
      'Look for "Bitmap Heap Scan" and "Bitmap Index Scan"'
    ],
    explanation: 'Bitmap Heap Scan is used for moderately selective queries (typically 5-25% of rows). It builds a bitmap of matching heap pages from the index, then scans those pages in physical order. This is more efficient than Index Scan for larger result sets.',
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
    order: 6,
    difficulty: 3
  }
];
