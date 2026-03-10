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
  },
  {
    id: 'hash-join-batches-low-mem',
    lessonId: '',
    type: 'sql-query',
    title: 'Hash Join: Spilling to Disk',
    prompt: 'Set work_mem to 64kB and run the join query. Look for "Batches" in the Hash node — it should be greater than 1, meaning the hash table didn\'t fit in memory.',
    setupSql: `
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      CREATE TABLE customers (id SERIAL PRIMARY KEY, name TEXT, city TEXT);
      CREATE TABLE orders (id SERIAL PRIMARY KEY, customer_id INTEGER, total NUMERIC, created_at DATE);
      INSERT INTO customers (name, city)
      SELECT 'Customer ' || i, CASE (i % 5) WHEN 0 THEN 'Boston' WHEN 1 THEN 'NYC' WHEN 2 THEN 'LA' WHEN 3 THEN 'Chicago' ELSE 'Seattle' END
      FROM generate_series(1, 5000) i;
      INSERT INTO orders (customer_id, total, created_at)
      SELECT (random() * 4999 + 1)::integer, (random() * 1000)::numeric, '2024-01-01'::date + (random() * 365)::integer
      FROM generate_series(1, 100000) i;
      ANALYZE customers;
      ANALYZE orders;
    `,
    hints: [
      'Start your query with: SET work_mem = \'64kB\';',
      'Then: EXPLAIN (ANALYZE) SELECT c.name, o.total FROM customers c JOIN orders o ON c.id = o.customer_id;',
      'Look for "Batches:" in the Hash node of the output'
    ],
    explanation: 'When work_mem is too small to hold the hash table, PostgreSQL splits the join into multiple batches (Grace Hash Join). Each batch is processed independently, requiring multiple passes over the data. Increasing work_mem reduces batches to 1, keeping everything in memory.',
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
    difficulty: 5
  },
  {
    id: 'hash-join-batches-high-mem',
    lessonId: '',
    type: 'sql-query',
    title: 'Hash Join: In-Memory with Large work_mem',
    prompt: 'Now set work_mem to 256MB and run the same join query. The hash join should complete in a single batch.',
    setupSql: `
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      CREATE TABLE customers (id SERIAL PRIMARY KEY, name TEXT, city TEXT);
      CREATE TABLE orders (id SERIAL PRIMARY KEY, customer_id INTEGER, total NUMERIC);
      INSERT INTO customers (name, city)
      SELECT 'Customer ' || i, 'City ' || (i % 10)
      FROM generate_series(1, 5000) i;
      INSERT INTO orders (customer_id, total)
      SELECT (random() * 4999 + 1)::integer, (random() * 1000)::numeric
      FROM generate_series(1, 100000) i;
      ANALYZE customers;
      ANALYZE orders;
    `,
    hints: [
      'SET work_mem = \'256MB\'; EXPLAIN (ANALYZE) SELECT c.name, o.total FROM customers c JOIN orders o ON c.id = o.customer_id;',
      'Compare the "Batches" count to the previous exercise'
    ],
    explanation: 'With enough work_mem, the entire hash table fits in memory (Batches: 1). This avoids the overhead of partitioning and multiple passes, making the join significantly faster.',
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
    order: 7,
    difficulty: 5
  },
  {
    id: 'planner-algorithm-choice',
    lessonId: '',
    type: 'sql-query',
    title: 'How Table Size Affects Join Algorithm Choice',
    prompt: 'Run EXPLAIN on the join between a small lookup table (10 rows) and the large orders table. PostgreSQL should choose Nested Loop with Index Scan, not Hash Join. Why?',
    setupSql: `
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS statuses CASCADE;
      CREATE TABLE statuses (id SERIAL PRIMARY KEY, name TEXT);
      INSERT INTO statuses (name) VALUES ('pending'), ('processing'), ('shipped'), ('delivered'), ('cancelled'), ('returned'), ('refunded'), ('on_hold'), ('backordered'), ('completed');
      CREATE TABLE orders (id SERIAL PRIMARY KEY, status_id INTEGER REFERENCES statuses(id), total NUMERIC);
      INSERT INTO orders (status_id, total)
      SELECT (random() * 9 + 1)::integer, (random() * 500)::numeric
      FROM generate_series(1, 100000) i;
      CREATE INDEX idx_orders_status ON orders(status_id);
      ANALYZE statuses;
      ANALYZE orders;
    `,
    hints: [
      'EXPLAIN (ANALYZE) SELECT s.name, o.total FROM statuses s JOIN orders o ON s.id = o.status_id WHERE s.name = \'pending\';',
      'With only 1 matching row in statuses, Nested Loop + Index Scan on orders is much cheaper than hashing 100K rows'
    ],
    explanation: 'When one table is very small (especially after filtering), PostgreSQL prefers Nested Loop with an index lookup on the larger table. For each row in the small table, it does one index scan — much cheaper than building a hash table of the entire larger table.',
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
    order: 8,
    difficulty: 6
  }
];
