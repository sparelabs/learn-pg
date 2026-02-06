import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'version-check',
    lessonId: '', // Will be set by curriculum service
    type: 'sql-query',
    title: 'Check PostgreSQL Version',
    prompt: 'Write a query to display the PostgreSQL version information.',
    setupSql: '',
    hints: [
      'Use the SELECT statement',
      'PostgreSQL has a built-in version() function'
    ],
    explanation: 'The version() function returns detailed information about your PostgreSQL installation including version number, compilation details, and platform.',
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
    difficulty: 1
  },
  {
    id: 'simple-math',
    lessonId: '',
    type: 'sql-query',
    title: 'Basic Math Operations',
    prompt: 'Write a query that calculates 42 * 100 and displays the result with a column name "result".',
    setupSql: '',
    hints: [
      'Use SELECT to compute values',
      'Use AS to name the column',
      'No FROM clause is needed for simple calculations'
    ],
    explanation: 'PostgreSQL can perform calculations directly in SELECT statements without requiring a table. Use AS to give your computed column a meaningful name.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['result'],
            exactMatch: true
          },
          values: {
            exactMatch: [{ result: 4200 }]
          }
        }
      }
    },
    order: 2,
    difficulty: 1
  }
];
