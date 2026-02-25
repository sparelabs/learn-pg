import type { Exercise, MultiSessionExercise } from '@learn-pg/shared';

export const exercises: (Exercise | MultiSessionExercise)[] = [
  {
    id: 'view-pg-locks',
    lessonId: '',
    type: 'sql-query',
    title: 'View Active Locks',
    prompt: 'Start a transaction, lock some rows with FOR UPDATE, then query pg_locks to see the locks you\'re holding. Run: BEGIN; SELECT * FROM test_locks FOR UPDATE; SELECT locktype, relation::regclass, mode, granted FROM pg_locks WHERE relation = \'test_locks\'::regclass; COMMIT;',
    setupSql: `
      DROP TABLE IF EXISTS test_locks;
      CREATE TABLE test_locks (
        id INTEGER PRIMARY KEY,
        value TEXT
      );
      INSERT INTO test_locks VALUES (1, 'a'), (2, 'b'), (3, 'c');
    `,
    hints: [
      'Use BEGIN to start a transaction, then SELECT ... FOR UPDATE',
      'Query pg_locks filtered by your table\'s OID',
      'Use relation::regclass to convert OIDs to table names',
      'End with COMMIT to release locks'
    ],
    explanation: 'pg_locks shows all locks in the system. When you SELECT ... FOR UPDATE, PostgreSQL acquires RowExclusiveLock on the table and individual row locks. The relation::regclass cast converts the relation OID to a human-readable table name.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['locktype', 'mode', 'granted']
          }
        }
      }
    },
    order: 1,
    difficulty: 3
  },
  {
    id: 'lock-types',
    lessonId: '',
    type: 'sql-query',
    title: 'Explore Lock Modes',
    prompt: 'Query pg_locks to see all different lock types currently held in the system. Run: SELECT locktype, mode, count(*) FROM pg_locks GROUP BY locktype, mode ORDER BY locktype, mode.',
    setupSql: '',
    hints: [
      'pg_locks shows locks from all connections',
      'GROUP BY locktype, mode to see distinct lock types',
      'Common locktypes: relation, transactionid, virtualxid, advisory'
    ],
    explanation: 'PostgreSQL uses many lock types beyond just table and row locks. You\'ll typically see: relation locks (table-level), transactionid locks (held by every active transaction on its own ID), virtualxid locks (virtual transaction IDs), and possibly advisory locks. Understanding the variety helps when debugging concurrency issues.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['locktype', 'mode', 'count']
          },
          rowCount: { min: 1 }
        }
      }
    },
    order: 2,
    difficulty: 3
  },
  {
    id: 'deadlock-detection',
    lessonId: '',
    type: 'multi-session',
    title: 'Trigger Deadlock Detection',
    prompt: 'Create a deadlock: Session A locks row 1 and waits for row 2, Session B locks row 2 and waits for row 1. PostgreSQL detects the cycle and aborts one transaction.',
    setupSql: `
      DROP TABLE IF EXISTS deadlock_test;
      CREATE TABLE deadlock_test (
        id INTEGER PRIMARY KEY,
        value TEXT
      );
      INSERT INTO deadlock_test VALUES (1, 'a'), (2, 'b');
    `,
    hints: [
      'Each session updates one row first (acquiring its lock)',
      'Then each tries to update the other\'s locked row',
      'After ~1 second, PostgreSQL detects the deadlock and aborts one transaction'
    ],
    explanation: 'PostgreSQL\'s deadlock detector runs after deadlock_timeout (default 1 second). It builds a waits-for graph and looks for cycles. When it finds one, it aborts the transaction that would be least expensive to restart, raising "ERROR: deadlock detected". The other transaction can then proceed.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 0 }
        }
      }
    },
    order: 3,
    difficulty: 5,
    sessions: {
      sessionAPrompt: 'This session locks row 1 first, then tries to lock row 2.',
      sessionBPrompt: 'This session locks row 2 first, then tries to lock row 1 — causing a deadlock.',
      sessionAInitialQuery: 'BEGIN;',
      sessionBInitialQuery: 'BEGIN;'
    },
    steps: [
      {
        session: 'A',
        instruction: "Start and lock row 1: BEGIN; UPDATE deadlock_test SET value = 'a1' WHERE id = 1;"
      },
      {
        session: 'B',
        instruction: "Start and lock row 2: BEGIN; UPDATE deadlock_test SET value = 'b2' WHERE id = 2;"
      },
      {
        session: 'A',
        instruction: "Try to lock row 2 (this will wait): UPDATE deadlock_test SET value = 'a2' WHERE id = 2;"
      },
      {
        session: 'B',
        instruction: "Try to lock row 1 (deadlock!): UPDATE deadlock_test SET value = 'b1' WHERE id = 1;"
      },
      {
        session: 'A',
        instruction: 'One session got a deadlock error. Check: SELECT * FROM deadlock_test;'
      }
    ]
  } as MultiSessionExercise
];
