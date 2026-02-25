import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'multicolumn-ordering',
    lessonId: '',
    type: 'sql-query',
    title: 'Multi-Column Index: First Column Filter',
    prompt: 'A composite index on (city, name) has been created. Run EXPLAIN to see that filtering on city (the first column) can use the index. Run: EXPLAIN SELECT * FROM users WHERE city = \'Boston\'.',
    setupSql: `
      DROP TABLE IF EXISTS users;
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        city TEXT,
        name TEXT,
        email TEXT
      );
      INSERT INTO users (city, name, email)
      SELECT
        (ARRAY['Boston', 'New York', 'Chicago', 'Seattle', 'Austin'])[1 + (random() * 4)::int],
        'user_' || i,
        'user_' || i || '@example.com'
      FROM generate_series(1, 10000) i;
      CREATE INDEX idx_users_city_name ON users(city, name);
      ANALYZE users;
    `,
    hints: [
      'Use EXPLAIN (not EXPLAIN ANALYZE) to see the plan without executing',
      'Look for "Index Scan" or "Index Cond" in the output',
      'The index on (city, name) can serve queries filtering on city alone'
    ],
    explanation: 'A composite index (city, name) sorts first by city, then by name within each city. A query filtering only on city can use this index because all entries for a given city are grouped together in the B+ tree leaf pages. This is the leftmost prefix rule.',
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
    id: 'multicolumn-wrong-column',
    lessonId: '',
    type: 'sql-query',
    title: 'Multi-Column Index: Wrong Column Filter',
    prompt: 'Now try filtering on name only (the second column) using the same (city, name) index. Run: EXPLAIN SELECT * FROM users WHERE name = \'user_42\'. Notice the planner chooses a Seq Scan — the index can\'t help with a filter on the non-leading column.',
    setupSql: `
      DROP TABLE IF EXISTS users;
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        city TEXT,
        name TEXT,
        email TEXT
      );
      INSERT INTO users (city, name, email)
      SELECT
        (ARRAY['Boston', 'New York', 'Chicago', 'Seattle', 'Austin'])[1 + (random() * 4)::int],
        'user_' || i,
        'user_' || i || '@example.com'
      FROM generate_series(1, 10000) i;
      CREATE INDEX idx_users_city_name ON users(city, name);
      ANALYZE users;
    `,
    hints: [
      'EXPLAIN SELECT * FROM users WHERE name = \'user_42\'',
      'The index on (city, name) cannot efficiently serve WHERE name = ...',
      'You\'d need to scan every city group to find the name — essentially a full scan'
    ],
    explanation: 'The index on (city, name) sorts by city first. To find name = \'user_42\', you\'d need to look through every city\'s entries — equivalent to scanning the entire index. The planner recognizes this and chooses a Sequential Scan instead. This demonstrates why column order in multi-column indexes matters: the index can only be used for leftmost prefix filters.',
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
    id: 'partial-index',
    lessonId: '',
    type: 'sql-query',
    title: 'Create and Use a Partial Index',
    prompt: 'Create a partial index that only covers active orders, then verify the planner uses it. Run these statements: CREATE INDEX idx_active_orders ON orders(id) WHERE status = \'active\'; then EXPLAIN SELECT * FROM orders WHERE status = \'active\' AND id = 42.',
    setupSql: `
      DROP TABLE IF EXISTS orders;
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        status TEXT,
        total NUMERIC
      );
      INSERT INTO orders (status, total)
      SELECT
        CASE WHEN random() < 0.1 THEN 'active' ELSE 'completed' END,
        (random() * 1000)::numeric(10,2)
      FROM generate_series(1, 50000) i;
      DROP INDEX IF EXISTS idx_active_orders;
      ANALYZE orders;
    `,
    hints: [
      'First: CREATE INDEX idx_active_orders ON orders(id) WHERE status = \'active\'',
      'Then: EXPLAIN SELECT * FROM orders WHERE status = \'active\' AND id = 42',
      'The partial index only contains ~10% of rows (active ones), so it\'s much smaller'
    ],
    explanation: 'A partial index only includes rows matching its WHERE clause. This index on active orders is roughly 10x smaller than a full index because only ~10% of orders are active. The planner uses it when your query\'s WHERE clause implies the index predicate. Partial indexes are great for status-based filtering where you only query certain statuses.',
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
  },
  {
    id: 'expression-index',
    lessonId: '',
    type: 'sql-query',
    title: 'Create and Use an Expression Index',
    prompt: 'Create an expression index on lower(email) for case-insensitive lookups, then verify the planner uses it. Run: CREATE INDEX idx_lower_email ON users(lower(email)); then EXPLAIN SELECT * FROM users WHERE lower(email) = \'user_1@example.com\'.',
    setupSql: `
      DROP TABLE IF EXISTS users;
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT
      );
      INSERT INTO users (name, email)
      SELECT 'user_' || i, 'User_' || i || '@Example.COM'
      FROM generate_series(1, 10000) i;
      DROP INDEX IF EXISTS idx_lower_email;
      ANALYZE users;
    `,
    hints: [
      'First: CREATE INDEX idx_lower_email ON users(lower(email))',
      'Then: EXPLAIN SELECT * FROM users WHERE lower(email) = \'user_1@example.com\'',
      'The query must use the exact same expression as the index'
    ],
    explanation: 'An expression index indexes the result of a function applied to a column. The index on lower(email) stores the lowercased values, enabling efficient case-insensitive lookups. The query must use the same expression — WHERE lower(email) = ... — for the planner to match it to the index. This pattern is common for email addresses, usernames, and other case-insensitive text.',
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
    order: 4,
    difficulty: 3
  }
];
