import type { Exercise } from '@learn-pg/shared';

const exercises: Exercise[] = [
  {
    id: 'caching-01-01',
    lessonId: 'caching-and-prepared-statements-01',
    type: 'sql-query',
    title: 'Check Shared Buffers Configuration',
    prompt: 'Write a query to display the current shared_buffers setting.',
    setupSql: null,
    hints: [
      'Use the SHOW command',
      'The parameter is called shared_buffers'
    ],
    explanation: 'SHOW shared_buffers displays the current size of PostgreSQL\'s buffer cache. This is the amount of memory PostgreSQL uses to cache data pages.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['shared_buffers'],
          exactMatch: false
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'caching-01-02',
    lessonId: 'caching-and-prepared-statements-01',
    type: 'sql-query',
    title: 'Check effective_cache_size',
    prompt: 'Write a query to display the effective_cache_size parameter, which tells the planner how much memory is available for caching.',
    setupSql: null,
    hints: [
      'Use the SHOW command',
      'The parameter is called effective_cache_size'
    ],
    explanation: 'effective_cache_size is a hint to the query planner about the total memory available for caching (shared_buffers + OS cache). It affects whether the planner chooses index scans vs sequential scans.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['effective_cache_size'],
          exactMatch: false
        }
      }
    },
    order: 2,
    difficulty: 1
  },
  {
    id: 'caching-01-03',
    lessonId: 'caching-and-prepared-statements-01',
    type: 'sql-query',
    title: 'Check Multiple Memory Settings',
    prompt: 'Write a query to show shared_buffers, effective_cache_size, and work_mem in a single result set.',
    setupSql: null,
    hints: [
      'You can SELECT from pg_settings',
      'Filter by name IN (\'shared_buffers\', \'effective_cache_size\', \'work_mem\')',
      'Select the name and setting columns'
    ],
    explanation: 'The pg_settings view contains all configuration parameters. Querying it allows you to see multiple settings at once and their current values.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 3 },
        columns: {
          required: ['name', 'setting'],
          exactMatch: false
        }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: 'caching-01-04',
    lessonId: 'caching-and-prepared-statements-01',
    type: 'sql-query',
    title: 'View Cost Parameters',
    prompt: 'Write a query to display the four main cost parameters: seq_page_cost, random_page_cost, cpu_tuple_cost, and cpu_operator_cost.',
    setupSql: null,
    hints: [
      'Query pg_settings',
      'Filter by name IN (...)',
      'Select name and setting columns'
    ],
    explanation: 'These cost parameters affect how the planner calculates the estimated cost of different execution plans. Lower values make that operation cheaper in the planner\'s estimation.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 4 },
        columns: {
          required: ['name', 'setting'],
          exactMatch: false
        }
      }
    },
    order: 4,
    difficulty: 2
  },
  {
    id: 'caching-01-05',
    lessonId: 'caching-and-prepared-statements-01',
    type: 'sql-query',
    title: 'Identify SSD vs HDD Configuration',
    prompt: 'Write a query that shows the random_page_cost setting and indicates whether it appears to be configured for SSD (<= 2.0) or HDD (> 2.0). Use a CASE expression to add a column called storage_type.',
    setupSql: null,
    hints: [
      'Query pg_settings for random_page_cost',
      'Use CASE WHEN setting::numeric <= 2.0 THEN \'SSD\' ELSE \'HDD\' END',
      'You\'ll need to cast setting to numeric to compare'
    ],
    explanation: 'random_page_cost should be set lower for SSDs (1.1) than HDDs (4.0) because random access is much faster on SSDs. This helps the planner make better decisions about index usage.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 1 },
        columns: {
          required: ['random_page_cost', 'storage_type'],
          exactMatch: false
        }
      }
    },
    order: 5,
    difficulty: 3
  }
];

export { exercises };
