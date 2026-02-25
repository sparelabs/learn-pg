import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'range-partition',
    lessonId: '',
    type: 'sql-query',
    title: 'Create a Range-Partitioned Table',
    prompt: 'Create a range-partitioned events table partitioned by month. Create the parent table, three monthly partitions (2025-01, 2025-02, 2025-03), insert some data, then verify rows landed in the correct partitions with: SELECT tableoid::regclass AS partition, count(*) FROM events GROUP BY 1 ORDER BY 1.',
    setupSql: `
      DROP TABLE IF EXISTS events CASCADE;
      CREATE TABLE events (
        id SERIAL,
        created_at TIMESTAMPTZ NOT NULL,
        event_type TEXT NOT NULL,
        data TEXT
      ) PARTITION BY RANGE (created_at);

      CREATE TABLE events_2025_01 PARTITION OF events
        FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
      CREATE TABLE events_2025_02 PARTITION OF events
        FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
      CREATE TABLE events_2025_03 PARTITION OF events
        FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

      INSERT INTO events (created_at, event_type, data)
      SELECT
        '2025-01-15'::timestamptz + (random() * 75)::int * interval '1 day',
        (ARRAY['click', 'view', 'purchase'])[1 + (random() * 2)::int],
        'event_data_' || i
      FROM generate_series(1, 300) i;

      ANALYZE events;
    `,
    hints: [
      'SELECT tableoid::regclass AS partition, count(*) FROM events GROUP BY 1 ORDER BY 1',
      'tableoid::regclass converts the internal OID to the partition table name',
      'You should see rows distributed across the three monthly partitions'
    ],
    explanation: 'tableoid is a system column that identifies which physical table (partition) each row belongs to. Casting to ::regclass gives the human-readable table name. The rows are distributed across partitions based on their created_at value matching the partition ranges.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 2 },
          columns: {
            required: ['partition', 'count']
          }
        }
      }
    },
    order: 1,
    difficulty: 3
  },
  {
    id: 'hash-partition',
    lessonId: '',
    type: 'sql-query',
    title: 'Create a Hash-Partitioned Table',
    prompt: 'A hash-partitioned users table with 4 partitions has been created and populated. Verify the even distribution by querying: SELECT tableoid::regclass AS partition, count(*) FROM users GROUP BY 1 ORDER BY 1.',
    setupSql: `
      DROP TABLE IF EXISTS users CASCADE;
      CREATE TABLE users (
        id SERIAL,
        name TEXT NOT NULL,
        email TEXT NOT NULL
      ) PARTITION BY HASH (id);

      CREATE TABLE users_p0 PARTITION OF users FOR VALUES WITH (MODULUS 4, REMAINDER 0);
      CREATE TABLE users_p1 PARTITION OF users FOR VALUES WITH (MODULUS 4, REMAINDER 1);
      CREATE TABLE users_p2 PARTITION OF users FOR VALUES WITH (MODULUS 4, REMAINDER 2);
      CREATE TABLE users_p3 PARTITION OF users FOR VALUES WITH (MODULUS 4, REMAINDER 3);

      INSERT INTO users (name, email)
      SELECT 'user_' || i, 'user_' || i || '@example.com'
      FROM generate_series(1, 10000) i;

      ANALYZE users;
    `,
    hints: [
      'SELECT tableoid::regclass AS partition, count(*) FROM users GROUP BY 1 ORDER BY 1',
      'Hash partitioning distributes rows evenly across partitions',
      'Each partition should have roughly 2,500 rows (10,000 / 4)'
    ],
    explanation: 'Hash partitioning uses hash(partition_key) % modulus to assign rows to partitions. This ensures an even distribution regardless of the data distribution. Each partition should have approximately 10,000 / 4 = 2,500 rows, with minor variation due to the hash function.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 4 },
          columns: {
            required: ['partition', 'count']
          }
        }
      }
    },
    order: 2,
    difficulty: 3
  },
  {
    id: 'list-partition',
    lessonId: '',
    type: 'sql-query',
    title: 'Create a List-Partitioned Table',
    prompt: 'A list-partitioned orders table organized by region has been created. Insert some orders and verify the distribution: SELECT tableoid::regclass AS partition, count(*) FROM orders GROUP BY 1 ORDER BY 1.',
    setupSql: `
      DROP TABLE IF EXISTS orders CASCADE;
      CREATE TABLE orders (
        id SERIAL,
        region TEXT NOT NULL,
        total NUMERIC(10,2) NOT NULL
      ) PARTITION BY LIST (region);

      CREATE TABLE orders_americas PARTITION OF orders FOR VALUES IN ('us-east', 'us-west', 'canada');
      CREATE TABLE orders_europe PARTITION OF orders FOR VALUES IN ('eu-west', 'eu-central', 'uk');
      CREATE TABLE orders_apac PARTITION OF orders FOR VALUES IN ('ap-southeast', 'ap-northeast', 'oceania');

      INSERT INTO orders (region, total)
      SELECT
        (ARRAY['us-east', 'us-west', 'canada', 'eu-west', 'eu-central', 'uk', 'ap-southeast', 'ap-northeast', 'oceania'])[1 + (random() * 8)::int],
        (random() * 500 + 10)::numeric(10,2)
      FROM generate_series(1, 300) i;

      ANALYZE orders;
    `,
    hints: [
      'SELECT tableoid::regclass AS partition, count(*) FROM orders GROUP BY 1 ORDER BY 1',
      'List partitioning maps specific values to partitions',
      'You should see 3 partitions with rows distributed by region'
    ],
    explanation: 'List partitioning assigns rows to partitions based on exact value matches. Orders from US regions go to orders_americas, European orders to orders_europe, and Asia-Pacific to orders_apac. This is ideal for categorical data where you know all possible values upfront.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 3 },
          columns: {
            required: ['partition', 'count']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  }
];
