import type { Exercise, MultiSessionExercise } from '@learn-pg/shared';

export const exercises: (Exercise | MultiSessionExercise)[] = [
  {
    id: 'lost-update-demo',
    lessonId: '',
    type: 'multi-session',
    title: 'Lost Update Demonstration',
    prompt: 'Demonstrate a lost update: both sessions read a balance, compute a new value, and write — the first write is lost.',
    setupSql: `
      DROP TABLE IF EXISTS accounts;
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        balance NUMERIC(10,2) NOT NULL
      );
      INSERT INTO accounts VALUES (1, 1000.00);
    `,
    hints: [
      'Both sessions read the same balance (1000)',
      'Session A adds 100, Session B subtracts 50',
      'The last COMMIT wins — Session A\'s change is lost'
    ],
    explanation: 'Under READ COMMITTED, both transactions read balance = 1000. Session A writes 1100, Session B writes 950. Session B\'s COMMIT overwrites Session A\'s change — the +100 is lost. The final balance is 950 instead of the correct 1050. This is the "lost update" anomaly.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 }
        }
      }
    },
    order: 1,
    difficulty: 3,
    sessions: {
      sessionAPrompt: 'This session will read the balance and add 100.',
      sessionBPrompt: 'This session will read the balance and subtract 50.',
      sessionAInitialQuery: 'BEGIN;',
      sessionBInitialQuery: 'BEGIN;'
    },
    steps: [
      {
        session: 'A',
        instruction: 'Start a transaction: BEGIN;'
      },
      {
        session: 'A',
        instruction: 'Read the balance: SELECT balance FROM accounts WHERE id = 1;'
      },
      {
        session: 'B',
        instruction: 'Start a transaction: BEGIN;'
      },
      {
        session: 'B',
        instruction: 'Read the same balance: SELECT balance FROM accounts WHERE id = 1;'
      },
      {
        session: 'A',
        instruction: 'Update based on read value (1000 + 100): UPDATE accounts SET balance = 1100 WHERE id = 1;'
      },
      {
        session: 'A',
        instruction: 'Commit: COMMIT;'
      },
      {
        session: 'B',
        instruction: 'Update based on read value (1000 - 50): UPDATE accounts SET balance = 950 WHERE id = 1;'
      },
      {
        session: 'B',
        instruction: 'Commit: COMMIT;'
      },
      {
        session: 'A',
        instruction: 'Check the final balance — Session A\'s +100 was lost: SELECT balance FROM accounts WHERE id = 1;'
      }
    ]
  } as MultiSessionExercise,
  {
    id: 'prevent-lost-update',
    lessonId: '',
    type: 'multi-session',
    title: 'Prevent Lost Update with FOR UPDATE',
    prompt: 'Use SELECT ... FOR UPDATE to prevent the lost update by locking the row before reading.',
    setupSql: `
      DROP TABLE IF EXISTS accounts;
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        balance NUMERIC(10,2) NOT NULL
      );
      INSERT INTO accounts VALUES (1, 1000.00);
    `,
    hints: [
      'FOR UPDATE locks the row — other transactions must wait',
      'Session B will block on its SELECT FOR UPDATE until Session A commits',
      'Session B then reads the updated value, computing correctly'
    ],
    explanation: 'SELECT ... FOR UPDATE acquires a row lock. When Session A locks the row, Session B\'s FOR UPDATE blocks until Session A commits. Session B then reads the updated balance (1100) and correctly computes 1100 - 50 = 1050. No update is lost.',
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
    difficulty: 4,
    sessions: {
      sessionAPrompt: 'This session locks the row with FOR UPDATE before modifying.',
      sessionBPrompt: 'This session also uses FOR UPDATE — it will wait until Session A commits.',
      sessionAInitialQuery: 'BEGIN;',
      sessionBInitialQuery: 'BEGIN;'
    },
    steps: [
      {
        session: 'A',
        instruction: 'Start and lock the row: BEGIN; SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;'
      },
      {
        session: 'A',
        instruction: 'Update: UPDATE accounts SET balance = 1100 WHERE id = 1;'
      },
      {
        session: 'A',
        instruction: 'Commit (this releases the lock): COMMIT;'
      },
      {
        session: 'B',
        instruction: 'Now lock and read (sees updated value): BEGIN; SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;'
      },
      {
        session: 'B',
        instruction: 'Update based on correct value (1100 - 50): UPDATE accounts SET balance = 1050 WHERE id = 1;'
      },
      {
        session: 'B',
        instruction: 'Commit: COMMIT;'
      },
      {
        session: 'A',
        instruction: 'Verify correct final balance (1050): SELECT balance FROM accounts WHERE id = 1;'
      }
    ]
  } as MultiSessionExercise,
  {
    id: 'phantom-read-demo',
    lessonId: '',
    type: 'multi-session',
    title: 'Phantom Read in READ COMMITTED',
    prompt: 'Observe a phantom read: Session A counts rows, Session B inserts a new row and commits, Session A recounts and sees the phantom row.',
    setupSql: `
      DROP TABLE IF EXISTS orders;
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        status TEXT NOT NULL,
        total NUMERIC(10,2)
      );
      INSERT INTO orders (status, total) VALUES
        ('pending', 100),
        ('pending', 200),
        ('completed', 300);
    `,
    hints: [
      'Under READ COMMITTED, each statement gets a fresh snapshot',
      'The second count in Session A sees Session B\'s committed insert',
      'Under REPEATABLE READ, the count would stay the same'
    ],
    explanation: 'Under READ COMMITTED, Session A\'s second SELECT count(*) sees Session B\'s newly committed row — a "phantom" that wasn\'t there for the first count. This is the phantom read anomaly. Under REPEATABLE READ, Session A would use its original snapshot and see the same count both times.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 }
        }
      }
    },
    order: 3,
    difficulty: 3,
    sessions: {
      sessionAPrompt: 'This session counts pending orders twice within a transaction.',
      sessionBPrompt: 'This session inserts a new pending order between the two counts.',
      sessionAInitialQuery: 'BEGIN;',
      sessionBInitialQuery: ''
    },
    steps: [
      {
        session: 'A',
        instruction: 'Start a transaction: BEGIN;'
      },
      {
        session: 'A',
        instruction: "Count pending orders: SELECT count(*) FROM orders WHERE status = 'pending';"
      },
      {
        session: 'B',
        instruction: "Insert a new pending order: INSERT INTO orders (status, total) VALUES ('pending', 400);"
      },
      {
        session: 'A',
        instruction: "Count again — notice the count increased (phantom read): SELECT count(*) FROM orders WHERE status = 'pending';"
      },
      {
        session: 'A',
        instruction: 'Commit: COMMIT;'
      }
    ]
  } as MultiSessionExercise
];
