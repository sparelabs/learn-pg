import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'bt-metap',
    lessonId: '',
    type: 'sql-query',
    requiresSuperuser: true,
    title: 'Inspect B+ Tree Metadata',
    prompt: 'A table with 100,000 rows and an index on the value column has been created. Use the pageinspect extension to examine the B+ tree metadata. Run: SELECT * FROM bt_metap(\'idx_btree_test_value\'). Look at the "level" field to see the tree height.',
    setupSql: `
      DROP TABLE IF EXISTS btree_test;
      CREATE TABLE btree_test (
        id INTEGER PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO btree_test SELECT i, (random() * 1000000)::integer FROM generate_series(1, 100000) i;
      CREATE INDEX idx_btree_test_value ON btree_test(value);
    `,
    hints: [
      'bt_metap() takes an index name as a string argument',
      'SELECT * FROM bt_metap(\'idx_btree_test_value\')',
      'The level field shows tree height (0 means root is a leaf)'
    ],
    explanation: 'bt_metap() returns metadata about a B+ tree index including the tree height (level), root page location, and fast root. For 100K rows with integer keys, the tree is typically 2 levels deep — a root and leaf level. The high fanout of B+ trees means even millions of rows only need 3-4 levels.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['level', 'fastroot']
          }
        }
      }
    },
    order: 1,
    difficulty: 3
  },
  {
    id: 'bt-page-stats',
    lessonId: '',
    type: 'sql-query',
    requiresSuperuser: true,
    title: 'Examine Index Page Statistics',
    prompt: 'Examine the statistics for page 1 (the first non-meta page) of the idx_btree_test_value index. Run: SELECT * FROM bt_page_stats(\'idx_btree_test_value\', 1). This shows the page type, number of live items, and free space.',
    setupSql: `
      DROP TABLE IF EXISTS btree_test;
      CREATE TABLE btree_test (
        id INTEGER PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO btree_test SELECT i, (random() * 1000000)::integer FROM generate_series(1, 100000) i;
      CREATE INDEX idx_btree_test_value ON btree_test(value);
    `,
    hints: [
      'bt_page_stats() takes the index name and a page number',
      'Page 0 is the metapage, page 1 is typically the root or first data page',
      'Look for the type field: l=leaf, i=internal, r=root'
    ],
    explanation: 'bt_page_stats() shows detailed statistics for a specific B-tree page. The type field indicates whether it\'s a leaf (l), internal (i), or root (r) page. live_items shows how many index entries are on this page, and free_size shows remaining space. High fanout comes from fitting many entries per page.',
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
    difficulty: 3
  },
  {
    id: 'bt-page-items',
    lessonId: '',
    type: 'sql-query',
    requiresSuperuser: true,
    title: 'View Individual Index Entries',
    prompt: 'Look at the individual entries on page 1 of the B+ tree index. Run: SELECT itemoffset, ctid, data FROM bt_page_items(\'idx_btree_test_value\', 1) LIMIT 10. Each entry shows the indexed value and the heap TID it points to.',
    setupSql: `
      DROP TABLE IF EXISTS btree_test;
      CREATE TABLE btree_test (
        id INTEGER PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO btree_test SELECT i, (random() * 1000000)::integer FROM generate_series(1, 100000) i;
      CREATE INDEX idx_btree_test_value ON btree_test(value);
    `,
    hints: [
      'bt_page_items() returns one row per index entry on the given page',
      'ctid is the heap tuple ID that this index entry points to',
      'data is the indexed key value in hex format'
    ],
    explanation: 'Each B+ tree leaf page contains sorted index entries. Each entry has an itemoffset (position on the page), a ctid (pointer to the heap tuple), and data (the indexed value). The entries are sorted by key value, which is why B-tree lookups are O(log N) — binary search within the page finds the right entry.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
          columns: {
            required: ['itemoffset', 'ctid', 'data']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  },
  {
    id: 'index-size-calculation',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate Index Size in Pages',
    prompt: 'Calculate how many 8KB pages the idx_btree_test_value index occupies. Use pg_relation_size() divided by 8192 and alias it as index_pages.',
    setupSql: `
      DROP TABLE IF EXISTS btree_test;
      CREATE TABLE btree_test (
        id INTEGER PRIMARY KEY,
        value INTEGER
      );
      INSERT INTO btree_test SELECT i, (random() * 1000000)::integer FROM generate_series(1, 100000) i;
      CREATE INDEX idx_btree_test_value ON btree_test(value);
    `,
    hints: [
      'pg_relation_size() works on indexes too, not just tables',
      'SELECT pg_relation_size(\'idx_btree_test_value\') / 8192 AS index_pages',
      'Compare to the table size to see the overhead'
    ],
    explanation: 'Index size in pages tells you the I/O footprint. For 100K integer entries, the index is typically around 275 pages (about 2.2 MB). Compare this to the table size to understand the storage overhead of indexing. Each additional index adds roughly this much overhead.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['index_pages']
          }
        }
      }
    },
    order: 4,
    difficulty: 2
  }
];
