import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'work-mem-per-operation',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Per-Operation work_mem Usage',
    prompt: 'A complex query with both a sort and a hash join has been set up. With tiny work_mem, both operations will spill to disk. Run: SET work_mem = \'64kB\'; EXPLAIN (ANALYZE) SELECT p.category, count(*) FROM products p JOIN orders o ON p.id = o.product_id GROUP BY p.category ORDER BY count(*) DESC. Notice that multiple nodes each use their own work_mem allocation.',
    setupSql: `
      DROP TABLE IF EXISTS orders;
      DROP TABLE IF EXISTS products;
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        category TEXT,
        name TEXT
      );
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        product_id INTEGER,
        quantity INTEGER
      );
      INSERT INTO products (category, name)
      SELECT 'cat_' || (i % 50), 'product_' || i
      FROM generate_series(1, 10000) i;
      INSERT INTO orders (product_id, quantity)
      SELECT (random() * 9999 + 1)::integer, (random() * 10 + 1)::integer
      FROM generate_series(1, 50000) i;
      ANALYZE products;
      ANALYZE orders;
    `,
    hints: [
      'SET work_mem = \'64kB\' before the EXPLAIN ANALYZE',
      'Look for multiple sort/hash nodes in the plan',
      'Each sort and hash operation independently uses up to work_mem'
    ],
    explanation: 'This query involves a hash join (or merge join), a hash aggregate for GROUP BY, and a sort for ORDER BY. Each operation independently allocates up to work_mem of memory. With work_mem = 64kB, some or all of these operations may spill to disk. This is why work_mem is per-operation — a single query can use multiple times work_mem total.',
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
    difficulty: 3
  },
  {
    id: 'log-temp-files',
    lessonId: '',
    type: 'sql-query',
    title: 'Enable Temporary File Logging',
    prompt: 'Enable logging of temporary files to detect disk spills. Run: SET log_temp_files = 0; SET work_mem = \'64kB\'; EXPLAIN (ANALYZE) SELECT * FROM products ORDER BY name. With log_temp_files = 0, PostgreSQL logs every temporary file created. The EXPLAIN output will show the disk sort.',
    setupSql: `
      DROP TABLE IF EXISTS products;
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        category TEXT,
        name TEXT,
        price NUMERIC
      );
      INSERT INTO products (category, name, price)
      SELECT 'cat_' || (i % 50), 'product_' || i, (random() * 1000)::numeric(10,2)
      FROM generate_series(1, 100000) i;
      ANALYZE products;
    `,
    hints: [
      'SET log_temp_files = 0 logs all temp files (size >= 0 bytes)',
      'Combine with small work_mem to trigger disk spills',
      'Check the EXPLAIN output for "external merge Disk:"'
    ],
    explanation: 'log_temp_files = 0 causes PostgreSQL to log a message for every temporary file created. In production, you might set this to a threshold like 1MB (log_temp_files = 1024) to catch only significant spills. This is one of the best ways to discover which queries need more work_mem or optimization to avoid disk sorts.',
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
    difficulty: 3
  }
];
