import type { Exercise, MultiSessionExercise } from '@learn-pg/shared';

export const exercises: (Exercise | MultiSessionExercise)[] = [
  {
    id: 'read-committed-visibility',
    lessonId: '',
    type: 'multi-session',
    title: 'Read Committed Isolation',
    prompt: 'Observe how uncommitted data in one session is invisible to another session under READ COMMITTED isolation.',
    setupSql: `
      DROP TABLE IF EXISTS accounts;
      CREATE TABLE accounts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        balance NUMERIC(10,2) NOT NULL
      );
      INSERT INTO accounts (name, balance) VALUES
        ('Alice', 1000.00),
        ('Bob', 500.00);
    `,
    hints: [
      'Use BEGIN to start a transaction',
      'UPDATE changes data but does not commit it until you run COMMIT',
      'SELECT in another session will not see uncommitted changes'
    ],
    explanation: 'Under READ COMMITTED isolation (PostgreSQL default), a transaction only sees rows committed before the current statement began. Session B cannot see the UPDATE from Session A until Session A commits.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 2 }
        }
      }
    },
    order: 1,
    difficulty: 3,
    sessions: {
      sessionAPrompt: 'This session will start a transaction and modify data without committing.',
      sessionBPrompt: 'This session will query the same table to observe isolation behavior.',
      sessionAInitialQuery: 'BEGIN;',
      sessionBInitialQuery: 'SELECT * FROM accounts;'
    },
    steps: [
      {
        session: 'A',
        instruction: 'Start a transaction with BEGIN'
      },
      {
        session: 'A',
        instruction: "Update Alice's balance: UPDATE accounts SET balance = 2000 WHERE name = 'Alice';"
      },
      {
        session: 'B',
        instruction: 'Query accounts to see that the update is NOT visible: SELECT * FROM accounts;'
      },
      {
        session: 'A',
        instruction: 'Commit the transaction: COMMIT;'
      },
      {
        session: 'B',
        instruction: 'Query again to see the committed change: SELECT * FROM accounts;'
      }
    ]
  } as MultiSessionExercise,
  {
    id: 'repeatable-read-snapshot',
    lessonId: '',
    type: 'multi-session',
    title: 'Repeatable Read Snapshot',
    prompt: 'Observe how REPEATABLE READ keeps a consistent snapshot even when other transactions commit changes.',
    setupSql: `
      DROP TABLE IF EXISTS orders;
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        product TEXT NOT NULL,
        total NUMERIC(10,2) NOT NULL
      );
      INSERT INTO orders (product, total) VALUES
        ('Widget', 10.00),
        ('Gadget', 20.00),
        ('Doohickey', 30.00);
    `,
    hints: [
      'BEGIN ISOLATION LEVEL REPEATABLE READ sets the isolation level',
      'The snapshot is taken at the first query after BEGIN',
      'New rows committed by other sessions are invisible to this snapshot'
    ],
    explanation: 'Under REPEATABLE READ, the transaction sees a snapshot from when its first query executed. Even though Session B committed new rows, Session A\'s count remains the same. This prevents both non-repeatable reads and phantom reads.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 }
        }
      }
    },
    order: 2,
    difficulty: 3,
    sessions: {
      sessionAPrompt: 'This session uses REPEATABLE READ to get a consistent snapshot.',
      sessionBPrompt: 'This session inserts new data and commits.',
      sessionAInitialQuery: 'BEGIN ISOLATION LEVEL REPEATABLE READ;',
      sessionBInitialQuery: ''
    },
    steps: [
      {
        session: 'A',
        instruction: 'Start a REPEATABLE READ transaction: BEGIN ISOLATION LEVEL REPEATABLE READ;'
      },
      {
        session: 'A',
        instruction: 'Count the orders: SELECT count(*) FROM orders;'
      },
      {
        session: 'B',
        instruction: "Insert a new order and commit: INSERT INTO orders (product, total) VALUES ('New Item', 50.00); COMMIT;"
      },
      {
        session: 'A',
        instruction: 'Count again — the count should be the same (snapshot isolation): SELECT count(*) FROM orders;'
      },
      {
        session: 'A',
        instruction: 'Commit to end the transaction: COMMIT;'
      }
    ]
  } as MultiSessionExercise,
  {
    id: 'no-dirty-reads',
    lessonId: '',
    type: 'sql-query',
    title: 'Verify No Dirty Reads',
    prompt: 'Demonstrate that PostgreSQL never allows dirty reads. In a single session, BEGIN a transaction, INSERT a row, SELECT to see it, ROLLBACK, then SELECT again to verify the row is gone. Run all statements in sequence.',
    setupSql: `
      DROP TABLE IF EXISTS test_dirty;
      CREATE TABLE test_dirty (id INTEGER, value TEXT);
    `,
    hints: [
      'Run: BEGIN; INSERT INTO test_dirty VALUES (1, \'phantom\'); SELECT * FROM test_dirty; ROLLBACK;',
      'Then: SELECT * FROM test_dirty;',
      'The final SELECT should return 0 rows'
    ],
    explanation: 'PostgreSQL never allows dirty reads. Even within the same session, a ROLLBACK removes all changes from the aborted transaction. The row inserted inside the transaction is visible to that transaction but vanishes after ROLLBACK. Other sessions would never have seen it at all.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 0 }
        }
      }
    },
    order: 3,
    difficulty: 2
  }
];
