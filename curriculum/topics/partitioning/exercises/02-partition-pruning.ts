import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'observe-pruning',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Partition Pruning',
    prompt: 'Run EXPLAIN (ANALYZE) on a query that filters on the partition key to see partition pruning in action. Only the matching partition should appear in the plan. Run: EXPLAIN (ANALYZE) SELECT * FROM events WHERE created_at >= \'2025-01-01\' AND created_at < \'2025-02-01\'.',
    setupSql: `
      DROP TABLE IF EXISTS events CASCADE;
      CREATE TABLE events (
        id SERIAL,
        created_at TIMESTAMPTZ NOT NULL,
        event_type TEXT
      ) PARTITION BY RANGE (created_at);

      CREATE TABLE events_2025_01 PARTITION OF events FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
      CREATE TABLE events_2025_02 PARTITION OF events FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
      CREATE TABLE events_2025_03 PARTITION OF events FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

      INSERT INTO events (created_at, event_type)
      SELECT
        '2025-01-01'::timestamptz + (random() * 89)::int * interval '1 day',
        'type_' || (i % 5)
      FROM generate_series(1, 3000) i;

      ANALYZE events;
    `,
    hints: [
      'EXPLAIN (ANALYZE) shows which partitions are actually scanned',
      'Only events_2025_01 should appear — the other partitions are pruned',
      'Look for "Subplans Removed" or just a single partition in the Append node'
    ],
    explanation: 'Partition pruning eliminated events_2025_02 and events_2025_03 from the plan because their ranges don\'t overlap with the query\'s WHERE clause. Only events_2025_01 is scanned. For a table with hundreds of partitions, this saves enormous I/O.',
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
    id: 'no-pruning',
    lessonId: '',
    type: 'sql-query',
    title: 'Query Without Pruning',
    prompt: 'Run EXPLAIN (ANALYZE) on a query that does NOT filter on the partition key. All partitions must be scanned. Run: EXPLAIN (ANALYZE) SELECT count(*) FROM events.',
    setupSql: `
      DROP TABLE IF EXISTS events CASCADE;
      CREATE TABLE events (
        id SERIAL,
        created_at TIMESTAMPTZ NOT NULL,
        event_type TEXT
      ) PARTITION BY RANGE (created_at);

      CREATE TABLE events_2025_01 PARTITION OF events FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
      CREATE TABLE events_2025_02 PARTITION OF events FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
      CREATE TABLE events_2025_03 PARTITION OF events FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

      INSERT INTO events (created_at, event_type)
      SELECT
        '2025-01-01'::timestamptz + (random() * 89)::int * interval '1 day',
        'type_' || (i % 5)
      FROM generate_series(1, 3000) i;

      ANALYZE events;
    `,
    hints: [
      'Without a WHERE on created_at, all partitions must be scanned',
      'Look for all three partitions in the Append node',
      'This is no better than scanning a single unpartitioned table'
    ],
    explanation: 'Without a filter on the partition key (created_at), PostgreSQL cannot prune any partitions. All three partitions are scanned and their results combined via Append. This demonstrates why the partition key should be present in most of your important queries — partitioning only helps when pruning is possible.',
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
    id: 'partitionwise-aggregate',
    lessonId: '',
    type: 'sql-query',
    title: 'Partition-Wise Aggregation',
    prompt: 'Enable partition-wise aggregation and see how PostgreSQL aggregates within each partition independently. Run: SET enable_partitionwise_aggregate = on; EXPLAIN (ANALYZE) SELECT date_trunc(\'month\', created_at) AS month, count(*) FROM events GROUP BY 1 ORDER BY 1.',
    setupSql: `
      DROP TABLE IF EXISTS events CASCADE;
      CREATE TABLE events (
        id SERIAL,
        created_at TIMESTAMPTZ NOT NULL,
        event_type TEXT
      ) PARTITION BY RANGE (created_at);

      CREATE TABLE events_2025_01 PARTITION OF events FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
      CREATE TABLE events_2025_02 PARTITION OF events FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
      CREATE TABLE events_2025_03 PARTITION OF events FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

      INSERT INTO events (created_at, event_type)
      SELECT
        '2025-01-01'::timestamptz + (random() * 89)::int * interval '1 day',
        'type_' || (i % 5)
      FROM generate_series(1, 3000) i;

      ANALYZE events;
    `,
    hints: [
      'SET enable_partitionwise_aggregate = on before the EXPLAIN',
      'Look for Partial HashAggregate or HashAggregate nodes under each partition',
      'Each partition aggregates independently before results are combined'
    ],
    explanation: 'With partition-wise aggregation, PostgreSQL performs the GROUP BY aggregation within each partition independently, then combines the partial results. This can be faster because each per-partition hash table is smaller (fits in work_mem), and partitions can be processed in parallel.',
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
