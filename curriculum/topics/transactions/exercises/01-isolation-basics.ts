import type { MultiSessionExercise } from '@learn-pg/shared';

export const exercises: MultiSessionExercise[] = [
  {
    id: 'read-committed-visibility',
    lessonId: '',
    type: 'multi-session',
    title: 'Read Committed Isolation',
    prompt: 'Observe how uncommitted data in one session is invisible to another session under READ COMMITTED isolation.',
    setupSql: `
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
  }
];
