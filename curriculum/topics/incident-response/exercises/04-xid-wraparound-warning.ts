import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'find-oldest-xid',
    lessonId: '',
    type: 'sql-query',
    title: 'Find the Oldest Transaction IDs',
    prompt:
      'The monitoring alert fired on XID age. Your first step is to find out which databases have the oldest unfrozen transaction IDs. Query pg_database to get each database name and the age of its datfrozenxid. Return datname and age(datfrozenxid) aliased as xid_age, ordered by xid_age descending.',
    setupSql: `
      -- pg_database is a system catalog; no setup needed.
      -- The student queries the actual system state.
      -- Create a table and do some work to ensure some XID aging.
      DROP TABLE IF EXISTS xid_test;
      CREATE TABLE xid_test (id SERIAL PRIMARY KEY, data TEXT);
      INSERT INTO xid_test (data)
      SELECT 'row_' || i FROM generate_series(1, 1000) i;
      UPDATE xid_test SET data = data || '_updated';
    `,
    hints: [
      'Query the pg_database system catalog',
      'Use age(datfrozenxid) to get the age as a simple integer',
      'Alias it as xid_age for clarity',
      'ORDER BY xid_age DESC to see the most urgent database first',
    ],
    explanation:
      'age(datfrozenxid) returns the number of transactions since the database was last fully frozen. This number grows over time as new transactions execute. When it approaches 2 billion (the 32-bit XID limit), PostgreSQL starts refusing writes to prevent data corruption. The autovacuum_freeze_max_age parameter (default 200 million) triggers anti-wraparound autovacuum, but if autovacuum cannot keep up, manual intervention is needed. Any database with an age over 150 million warrants investigation.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['datname', 'xid_age'],
          },
          rowCount: { min: 1 },
        },
      },
    },
    order: 1,
    difficulty: 5,
  },
  {
    id: 'find-table-and-freeze',
    lessonId: '',
    type: 'sql-query',
    title: 'Find the Worst Table and Freeze It',
    prompt:
      "Now drill down to the table level. Find the 5 tables with the oldest relfrozenxid by querying pg_class (filter for relkind = 'r' for ordinary tables). Return relname and age(relfrozenxid) aliased as xid_age, ordered by xid_age descending, limited to 5 rows. Then run VACUUM FREEZE on the xid_test table to reset its frozen XID.",
    setupSql: `
      DROP TABLE IF EXISTS xid_test;
      CREATE TABLE xid_test (id SERIAL PRIMARY KEY, data TEXT);
      INSERT INTO xid_test (data)
      SELECT 'row_' || i FROM generate_series(1, 5000) i;

      -- Generate some transaction churn
      UPDATE xid_test SET data = data || '_v2' WHERE id <= 2000;
      UPDATE xid_test SET data = data || '_v3' WHERE id <= 1000;
    `,
    hints: [
      "Query pg_class WHERE relkind = 'r' for regular tables",
      'Use age(relfrozenxid) aliased as xid_age',
      'ORDER BY xid_age DESC LIMIT 5',
      'After seeing the results, run VACUUM FREEZE xid_test to freeze the tuples',
      'Combine: first the VACUUM FREEZE, then the SELECT to verify the age dropped',
    ],
    explanation:
      'VACUUM FREEZE marks all tuples in the table as "frozen," meaning their transaction IDs are no longer relevant for visibility checks. This resets the relfrozenxid to the current transaction ID, dramatically reducing the age. In an emergency XID wraparound situation, you would VACUUM FREEZE the tables with the highest age first, working your way down until the overall database age is safe. This is resource-intensive (it rewrites tuple headers) so it should be done during low-traffic periods when possible.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['relname', 'xid_age'],
          },
          rowCount: { min: 1, max: 5 },
        },
      },
    },
    order: 2,
    difficulty: 6,
  },
];
