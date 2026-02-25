import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'detach-partition',
    lessonId: '',
    type: 'sql-query',
    title: 'Detach a Partition',
    prompt: 'Detach the January 2025 partition from the events table. This makes it a standalone table without deleting any data. Run: ALTER TABLE events DETACH PARTITION events_2025_01. Then verify by querying: SELECT tableoid::regclass AS partition, count(*) FROM events GROUP BY 1 ORDER BY 1.',
    setupSql: `
      DROP TABLE IF EXISTS events CASCADE;
      DROP TABLE IF EXISTS events_2025_01;
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
        '2025-01-15'::timestamptz + (random() * 75)::int * interval '1 day',
        'type_' || (i % 5)
      FROM generate_series(1, 300) i;
    `,
    hints: [
      'ALTER TABLE events DETACH PARTITION events_2025_01',
      'After detaching, the table events_2025_01 still exists with its data',
      'But it\'s no longer part of the events partitioned table'
    ],
    explanation: 'DETACH PARTITION removes a partition from the partitioned table hierarchy. The partition becomes a standalone table — its data is untouched. This is much faster than DELETE (instant vs generating WAL for every deleted row). Use this pattern for archiving old time-series data: detach, optionally dump, then drop.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
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
    id: 'attach-partition',
    lessonId: '',
    type: 'sql-query',
    title: 'Attach a New Partition',
    prompt: 'Create a new standalone table, populate it, then attach it as a partition. First create: CREATE TABLE events_2025_04 (LIKE events INCLUDING ALL); INSERT INTO events_2025_04 (created_at, event_type) SELECT \'2025-04-15\'::timestamptz, \'new_event\' FROM generate_series(1, 50); then attach: ALTER TABLE events ATTACH PARTITION events_2025_04 FOR VALUES FROM (\'2025-04-01\') TO (\'2025-05-01\'); finally verify: SELECT tableoid::regclass AS partition, count(*) FROM events GROUP BY 1 ORDER BY 1.',
    setupSql: `
      DROP TABLE IF EXISTS events CASCADE;
      DROP TABLE IF EXISTS events_2025_04;
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
        '2025-01-15'::timestamptz + (random() * 75)::int * interval '1 day',
        'type_' || (i % 5)
      FROM generate_series(1, 300) i;
    `,
    hints: [
      'Create the table: CREATE TABLE events_2025_04 (LIKE events INCLUDING ALL)',
      'Insert data: INSERT INTO events_2025_04 ...',
      'Attach: ALTER TABLE events ATTACH PARTITION events_2025_04 FOR VALUES FROM ... TO ...',
      'Verify: SELECT tableoid::regclass, count(*) FROM events GROUP BY 1 ORDER BY 1'
    ],
    explanation: 'ATTACH PARTITION adds an existing table as a partition. PostgreSQL validates that all rows satisfy the partition constraint (scanning the table). For large tables, add a CHECK constraint matching the range first — this lets PostgreSQL skip the validation scan. This pattern is useful for bulk loading: load data into a standalone table, add indexes, then attach.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 3 },
          columns: {
            required: ['partition', 'count']
          }
        }
      }
    },
    order: 2,
    difficulty: 4
  },
  {
    id: 'index-inheritance',
    lessonId: '',
    type: 'sql-query',
    title: 'Verify Index Inheritance',
    prompt: 'Create an index on the parent events table and verify it was automatically created on all partitions. Run: CREATE INDEX idx_events_type ON events(event_type); then SELECT tablename, indexname FROM pg_indexes WHERE indexname LIKE \'%events%type%\' OR indexname LIKE \'%event_type%\' ORDER BY tablename.',
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
        '2025-01-15'::timestamptz + (random() * 75)::int * interval '1 day',
        'type_' || (i % 5)
      FROM generate_series(1, 300) i;

      DROP INDEX IF EXISTS idx_events_type;
    `,
    hints: [
      'First: CREATE INDEX idx_events_type ON events(event_type)',
      'Then: query pg_indexes to find indexes on all partitions',
      'Each partition should have its own copy of the index'
    ],
    explanation: 'When you create an index on a partitioned table, PostgreSQL automatically creates matching indexes on all existing partitions (and will create them on any future partitions). Each partition gets its own independent index, which is smaller and faster to maintain than a single monolithic index. This is one of the operational benefits of partitioning.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 2 },
          columns: {
            required: ['tablename', 'indexname']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  }
];
