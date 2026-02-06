import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'setup-join-tables',
    lessonId: '',
    type: 'sql-query',
    title: 'Setup Tables for Join Examples',
    prompt: 'Create two tables: customers (id, name, city) and orders (id, customer_id, total). Insert sample data into both.',
    setupSql: `
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `,
    hints: [
      'CREATE TABLE customers with id (serial primary key), name (text), city (text)',
      'CREATE TABLE orders with id (serial primary key), customer_id (integer), total (numeric)',
      'Use INSERT with generate_series to create sample data'
    ],
    explanation: 'Setting up proper test tables is essential for exploring different join methods. The customers table represents the dimension table, while orders is the fact table with foreign key to customers.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 0 }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'observe-nested-loop',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Nested Loop Join',
    prompt: 'Use EXPLAIN to show the plan for joining customers and orders where customer city is Boston. With a small number of customers and an index, this should use Nested Loop.',
    setupSql: `
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;

      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT,
        city TEXT
      );

      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        total NUMERIC
      );

      INSERT INTO customers (name, city)
      SELECT 'Customer ' || i, CASE (i % 10) WHEN 0 THEN 'Boston' ELSE 'Other' END
      FROM generate_series(1, 100) i;

      INSERT INTO orders (customer_id, total)
      SELECT (random() * 99 + 1)::integer, (random() * 1000)::numeric
      FROM generate_series(1, 1000) i;

      CREATE INDEX idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX idx_customers_city ON customers(city);
      ANALYZE customers;
      ANALYZE orders;
    `,
    hints: [
      'Use EXPLAIN on the SELECT query',
      'JOIN customers c and orders o ON c.id = o.customer_id',
      'WHERE c.city = \'Boston\'',
      'Look for "Nested Loop" in the plan'
    ],
    explanation: 'Nested Loop Join is optimal when the outer table is small and the inner table has an index on the join column. For each customer in Boston, PostgreSQL uses the index to quickly find their orders.',
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
    id: 'observe-hash-join',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Hash Join',
    prompt: 'Use EXPLAIN to show the plan for joining all customers with all orders. With larger tables, this should use Hash Join.',
    setupSql: `
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;

      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name TEXT,
        city TEXT
      );

      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        total NUMERIC
      );

      INSERT INTO customers (name, city)
      SELECT 'Customer ' || i, 'City ' || (i % 20)
      FROM generate_series(1, 1000) i;

      INSERT INTO orders (customer_id, total)
      SELECT (random() * 999 + 1)::integer, (random() * 1000)::numeric
      FROM generate_series(1, 5000) i;

      ANALYZE customers;
      ANALYZE orders;
    `,
    hints: [
      'Use EXPLAIN on the query',
      'SELECT * FROM customers c JOIN orders o ON c.id = o.customer_id',
      'Look for "Hash Join" and "Hash" nodes in the plan'
    ],
    explanation: 'Hash Join is optimal for large-to-large equi-joins. PostgreSQL builds a hash table from the smaller table (customers) and probes it with each row from the larger table (orders). This is much more efficient than Nested Loop for large result sets.',
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
    id: 'create-sorted-indexes',
    lessonId: '',
    type: 'sql-query',
    title: 'Create Indexes for Merge Join',
    prompt: 'Create indexes on both join columns to enable Merge Join: idx_customers_id on customers(id) and idx_orders_customer_id on orders(customer_id).',
    setupSql: `
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;

      CREATE TABLE customers (
        id SERIAL,
        name TEXT,
        city TEXT
      );

      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        total NUMERIC
      );

      INSERT INTO customers (id, name, city)
      SELECT i, 'Customer ' || i, 'City ' || (i % 20)
      FROM generate_series(1, 1000) i;

      INSERT INTO orders (customer_id, total)
      SELECT (random() * 999 + 1)::integer, (random() * 1000)::numeric
      FROM generate_series(1, 5000) i;

      DROP INDEX IF EXISTS idx_customers_id;
      DROP INDEX IF EXISTS idx_orders_customer_id;
    `,
    hints: [
      'CREATE INDEX idx_customers_id ON customers(id)',
      'CREATE INDEX idx_orders_customer_id ON orders(customer_id)'
    ],
    explanation: 'Merge Join requires both sides to be sorted on the join column. Creating indexes on both join columns allows PostgreSQL to scan both tables in sorted order without explicit sorting steps.',
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
    id: 'observe-merge-join',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Merge Join',
    prompt: 'Use EXPLAIN to show the plan for joining customers and orders, ordering by customer id. With indexes on both join columns, this may show a Merge Join.',
    setupSql: `
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;

      CREATE TABLE customers (
        id INTEGER,
        name TEXT,
        city TEXT
      );

      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        total NUMERIC
      );

      INSERT INTO customers (id, name, city)
      SELECT i, 'Customer ' || i, 'City ' || (i % 20)
      FROM generate_series(1, 1000) i;

      INSERT INTO orders (customer_id, total)
      SELECT (random() * 999 + 1)::integer, (random() * 1000)::numeric
      FROM generate_series(1, 5000) i;

      CREATE INDEX idx_customers_id ON customers(id);
      CREATE INDEX idx_orders_customer_id ON orders(customer_id);
      ANALYZE customers;
      ANALYZE orders;
    `,
    hints: [
      'Use EXPLAIN on the query',
      'SELECT * FROM customers c JOIN orders o ON c.id = o.customer_id',
      'Add ORDER BY c.id',
      'Look for "Merge Join" in the plan'
    ],
    explanation: 'Merge Join is optimal when both sides are already sorted (via indexes) or when sorted output is needed. It scans both sorted inputs in parallel, merging matching rows. No hash table or repeated scans are needed.',
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
  }
];
