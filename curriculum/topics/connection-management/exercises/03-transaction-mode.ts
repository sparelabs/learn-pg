import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'set-local-pattern',
    lessonId: '',
    type: 'sql-query',
    title: 'Use SET LOCAL for Transaction-Scoped Settings',
    prompt:
      "In transaction pooling mode, session-level `SET` commands are dangerous because the connection may be reused by another client after your transaction ends. The safe pattern is `SET LOCAL`, which scopes the change to the current transaction only.\n\nDemonstrate this by running:\n```sql\nBEGIN;\nSET LOCAL work_mem = '256MB';\nSHOW work_mem;\nCOMMIT;\n```\n\nThis will return the work_mem value while it's set to 256MB within the transaction. After COMMIT, the setting automatically reverts.",
    setupSql: '',
    hints: [
      'Run all four statements as a single query block',
      'SET LOCAL only affects the current transaction',
      'SHOW work_mem returns the current value of the work_mem parameter'
    ],
    explanation:
      "SET LOCAL is the correct pattern for any configuration change in a pooled environment. It scopes the setting to the current transaction, so when the transaction ends and the server connection returns to the pool, no state leaks to the next client. This is better than session-level SET even without a pooler, because it makes the scope of the change explicit.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['work_mem']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'session-vs-transaction-set',
    lessonId: '',
    type: 'sql-query',
    title: 'Compare SET vs SET LOCAL Persistence',
    prompt:
      "Let's observe the difference between `SET` (session-scoped) and `SET LOCAL` (transaction-scoped).\n\nRun the following to see that `SET LOCAL` reverts after COMMIT while a plain `SET` persists:\n\n```sql\nBEGIN;\nSET LOCAL work_mem = '512MB';\nCOMMIT;\n```\n\nThen check the value:\n```sql\nSHOW work_mem;\n```\n\nThe value should be back to the default (e.g., `4MB`), proving SET LOCAL doesn't persist after the transaction.\n\nReturn the result of `SHOW work_mem` after the COMMIT to verify the value reverted.",
    setupSql: "RESET work_mem;",
    hints: [
      'Run BEGIN; SET LOCAL work_mem = \'512MB\'; COMMIT; first',
      'Then run SHOW work_mem; to see it reverted',
      'The final SHOW work_mem should return the default value, not 512MB'
    ],
    explanation:
      "After COMMIT, the SET LOCAL change is gone — work_mem returns to its default. This is exactly the behavior you want with a connection pooler: no state leaks between transactions. If you had used plain SET instead of SET LOCAL, the 512MB value would persist on the server connection and affect the next client who gets that connection from the pool — a subtle and hard-to-debug issue.",
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['work_mem']
          }
        }
      }
    },
    order: 2,
    difficulty: 3
  }
];
