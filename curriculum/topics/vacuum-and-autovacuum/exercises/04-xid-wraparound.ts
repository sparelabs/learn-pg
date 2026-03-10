import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'check-database-age',
    lessonId: '',
    type: 'sql-query',
    title: 'Check XID Age Across Databases',
    prompt:
      'Transaction ID (XID) wraparound is one of the most dangerous failure modes in PostgreSQL. The first step in monitoring is checking the age of the oldest unfrozen XID in each database.\n\nQuery `pg_database` to get the `datname` and `age(datfrozenxid)` for all databases, ordered by age descending. This tells you how close each database is to the wraparound limit.',
    setupSql: '',
    hints: [
      'Use: SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY age DESC',
      'The age() function returns how many transactions have occurred since the given XID',
      'Higher ages mean older unfrozen tuples — closer to the 2-billion wraparound limit',
    ],
    explanation:
      'The age(datfrozenxid) value shows how many transactions have passed since the oldest unfrozen XID in each database. PostgreSQL forces an anti-wraparound autovacuum when any table reaches autovacuum_freeze_max_age (default 200 million). If the age reaches ~2.1 billion, PostgreSQL refuses all write transactions to prevent data loss. In production, alert when age exceeds 500 million.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
          columns: {
            required: ['datname', 'age'],
          },
        },
      },
    },
    order: 1,
    difficulty: 3,
  },
  {
    id: 'check-table-age',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Tables with Oldest Unfrozen XIDs',
    prompt:
      'Each table tracks its own `relfrozenxid` — the oldest unfrozen XID that might exist in the table. Query `pg_class` to find the 10 regular tables (relkind = \'r\') with the highest `age(relfrozenxid)`, ordered by age descending.\n\nReturn `relname` and `age(relfrozenxid)` as `age`.',
    setupSql: `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (id SERIAL PRIMARY KEY, data TEXT);
      INSERT INTO test_table (data) SELECT repeat('x', 50) FROM generate_series(1, 1000);
    `,
    hints: [
      'Use: SELECT relname, age(relfrozenxid) AS age FROM pg_class WHERE relkind = \'r\' ORDER BY age DESC LIMIT 10',
      'relkind = \'r\' filters for regular tables (excludes indexes, sequences, views, etc.)',
      'The table with the highest age is the one most urgently needing VACUUM FREEZE',
    ],
    explanation:
      'relfrozenxid is the oldest XID that might still exist unfrozen in a table. The age() of this value tells you how many transactions have passed since then. The database-level datfrozenxid is the minimum relfrozenxid across all tables — so the single table with the highest age determines the database\'s XID age. This is why monitoring table-level ages is important: one neglected table can push the entire database toward wraparound.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1, max: 10 },
          columns: {
            required: ['relname', 'age'],
          },
        },
      },
    },
    order: 2,
    difficulty: 3,
  },
  {
    id: 'vacuum-freeze',
    lessonId: '',
    type: 'sql-query',
    title: 'VACUUM FREEZE and Verify Age Reduction',
    prompt:
      'The `test_table` has some unfrozen tuples. Run `VACUUM FREEZE` on it to freeze all eligible tuples, then verify that the table\'s `relfrozenxid` age has been reduced.\n\nRun VACUUM FREEZE, then query `pg_class` for the table\'s `relname` and `age(relfrozenxid)` as `age`.',
    setupSql: `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (id SERIAL PRIMARY KEY, data TEXT);
      INSERT INTO test_table (data)
      SELECT repeat('x', 50) FROM generate_series(1, 5000);
      ANALYZE test_table;
    `,
    hints: [
      'Run: VACUUM FREEZE test_table; SELECT relname, age(relfrozenxid) AS age FROM pg_class WHERE relname = \'test_table\'',
      'After VACUUM FREEZE, the age should be very low (close to 0)',
      'VACUUM FREEZE marks all eligible tuples as permanently visible, advancing relfrozenxid to near the current XID',
    ],
    explanation:
      'VACUUM FREEZE aggressively freezes all eligible tuples in the table, regardless of their age. After running, relfrozenxid advances to near the current transaction ID, making age() return a very small number. This is the manual intervention for tables approaching the wraparound limit. In normal operation, autovacuum handles freezing automatically, but VACUUM FREEZE is the emergency tool when you need to reduce XID age immediately.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['relname', 'age'],
          },
        },
      },
    },
    order: 3,
    difficulty: 4,
  },
];
