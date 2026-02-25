import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'hash-aggregate-single-batch',
    lessonId: '',
    type: 'sql-query',
    title: 'Hash Aggregate in Memory',
    prompt: 'With generous work_mem, run a GROUP BY that fits entirely in a single hash table batch. Run: SET work_mem = \'64MB\'; EXPLAIN (ANALYZE) SELECT category, count(*) FROM products GROUP BY category. Look for "HashAggregate" with "Batches: 1" in the output.',
    setupSql: `
      DROP TABLE IF EXISTS products;
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        category TEXT,
        name TEXT,
        price NUMERIC
      );
      INSERT INTO products (category, name, price)
      SELECT
        'cat_' || (i % 100),
        'product_' || i,
        (random() * 1000)::numeric(10,2)
      FROM generate_series(1, 100000) i;
      ANALYZE products;
    `,
    hints: [
      'SET work_mem = \'64MB\'; then the EXPLAIN ANALYZE query',
      'Look for HashAggregate in the plan',
      'Batches: 1 means the hash table fit in memory'
    ],
    explanation: 'With 100 distinct categories and 64MB work_mem, the hash table easily fits in memory (Batches: 1). Each category gets a hash bucket that accumulates the count. This is the fastest aggregation method — no sorting needed, just a single pass through the data building the hash table.',
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
    difficulty: 2
  },
  {
    id: 'hash-aggregate-multi-batch',
    lessonId: '',
    type: 'sql-query',
    title: 'Hash Aggregate with Multiple Batches',
    prompt: 'Force the hash aggregate to spill by using many groups and tiny work_mem. Run: SET work_mem = \'64kB\'; EXPLAIN (ANALYZE) SELECT name, count(*) FROM products GROUP BY name. With 100K distinct names, the hash table can\'t fit in 64kB. Look for "Batches: N" where N > 1.',
    setupSql: `
      DROP TABLE IF EXISTS products;
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        category TEXT,
        name TEXT,
        price NUMERIC
      );
      INSERT INTO products (category, name, price)
      SELECT
        'cat_' || (i % 100),
        'product_' || i,
        (random() * 1000)::numeric(10,2)
      FROM generate_series(1, 100000) i;
      ANALYZE products;
    `,
    hints: [
      'SET work_mem = \'64kB\' before the EXPLAIN ANALYZE',
      'GROUP BY name has 100K distinct values — too many for 64kB',
      'Look for Batches > 1, indicating disk spill'
    ],
    explanation: 'With 100K distinct group keys and only 64kB of work_mem, the hash table cannot fit in memory. PostgreSQL partitions the data into multiple batches, processing each batch separately and writing overflow to temporary files. More batches means more disk I/O and slower performance. Increasing work_mem reduces the batch count.',
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
  },
  {
    id: 'sort-vs-hash-agg',
    lessonId: '',
    type: 'sql-query',
    title: 'Sort-Based vs Hash-Based Aggregation',
    prompt: 'Disable hash aggregation to force a sort-based GroupAggregate, then compare the plan. Run: SET enable_hashagg = off; EXPLAIN (ANALYZE) SELECT category, count(*) FROM products GROUP BY category. Notice the plan now shows GroupAggregate with a Sort node instead of HashAggregate.',
    setupSql: `
      DROP TABLE IF EXISTS products;
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        category TEXT,
        name TEXT,
        price NUMERIC
      );
      INSERT INTO products (category, name, price)
      SELECT
        'cat_' || (i % 100),
        'product_' || i,
        (random() * 1000)::numeric(10,2)
      FROM generate_series(1, 100000) i;
      ANALYZE products;
    `,
    hints: [
      'SET enable_hashagg = off forces sort-based aggregation',
      'The plan will show GroupAggregate with a Sort child node',
      'After the exercise, you can SET enable_hashagg = on to restore defaults'
    ],
    explanation: 'Without hash aggregation, PostgreSQL must sort the data by the GROUP BY column first, then process consecutive groups (GroupAggregate). This approach uses a Sort + GroupAggregate plan instead of a single HashAggregate. For few groups, HashAggregate is typically faster. For many groups or pre-sorted data, GroupAggregate can win.',
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
    difficulty: 3
  }
];
