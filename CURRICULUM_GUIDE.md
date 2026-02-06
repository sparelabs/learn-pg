# Curriculum Authoring Guide

This guide explains how to create new topics, lessons, and exercises for the Learn PostgreSQL platform.

## Overview

Curriculum content consists of:
- **Topics**: High-level subject areas (e.g., "Query Optimization")
- **Lessons**: Individual learning units within a topic
- **Exercises**: Hands-on practice problems for each lesson
- **Evaluation Questions**: Questions for skill assessment

## Creating a New Topic

### 1. Create Topic Directory

```bash
mkdir -p curriculum/topics/NN-topic-name/{lessons,exercises}
```

Replace `NN` with the order number (e.g., `05-query-optimization`).

### 2. Create Topic Metadata

Create `meta.json` in the topic directory:

```json
{
  "title": "Query Optimization",
  "description": "Learn techniques for optimizing PostgreSQL queries",
  "level": 3,
  "estimatedWeeks": 2,
  "prerequisites": ["query-planner-internals"],
  "order": 5
}
```

**Fields**:
- `title`: Display name
- `description`: Brief description (1-2 sentences)
- `level`: Difficulty level (1-5)
- `estimatedWeeks`: Time to complete
- `prerequisites`: Array of topic IDs that should be completed first
- `order`: Sort order within the level

## Creating a Lesson

### 1. Create Lesson File

Create a Markdown file in `topics/NN-topic-name/lessons/`:

```markdown
---
title: Understanding Index Types
description: Learn about different PostgreSQL index types and when to use them
estimatedMinutes: 30
---

# Understanding Index Types

PostgreSQL provides several index types, each optimized for different use cases...

## B-tree Indexes

B-tree indexes are the default and most commonly used...

## Hash Indexes

Hash indexes are optimal for simple equality comparisons...

[Continue with lesson content...]
```

**Frontmatter Fields**:
- `title`: Lesson title
- `description`: Brief summary
- `estimatedMinutes`: Expected completion time

**Content Guidelines**:
- Use clear headings (##, ###)
- Include code examples in SQL code blocks
- Explain concepts before showing syntax
- Use real-world examples
- Keep paragraphs short and focused

## Creating Exercises

### 1. Create Exercise Definition File

Create a TypeScript file in `topics/NN-topic-name/exercises/` matching your lesson filename:

```typescript
import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'create-btree-index',
    lessonId: '', // Set automatically
    type: 'sql-query',
    title: 'Create a B-tree Index',
    prompt: 'Create a B-tree index on the users table for the email column.',
    setupSql: `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(100)
      );
    `,
    hints: [
      'Use the CREATE INDEX statement',
      'Specify the table and column name',
      'B-tree is the default index type'
    ],
    explanation: 'B-tree indexes are created using CREATE INDEX. They are the default type and excellent for equality and range queries on ordered data.',
    validation: {
      strategy: 'schema',
      rules: {
        strategy: 'schema',
        rules: {
          indexes: {
            required: [
              {
                table: 'users',
                columns: ['email'],
                type: 'btree'
              }
            ]
          }
        }
      }
    },
    order: 1,
    difficulty: 3
  }
];
```

### 2. Exercise Types

#### SQL Query Exercise

Tests if user can write a query that produces specific results:

```typescript
{
  type: 'sql-query',
  validation: {
    strategy: 'result-match',
    rules: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 10 },
        columns: {
          required: ['id', 'name', 'total'],
          exactMatch: true
        },
        values: {
          exactMatch: [
            { id: 1, name: 'Alice', total: 100 }
          ]
        }
      }
    }
  }
}
```

#### Optimization Exercise

Tests if query uses appropriate indexes and avoids expensive operations:

```typescript
{
  type: 'optimization',
  validation: {
    strategy: 'query-plan',
    rules: {
      strategy: 'query-plan',
      rules: {
        mustUseIndex: true,
        forbiddenNodes: ['Seq Scan'],
        requiredNodes: ['Index Scan']
      }
    }
  }
}
```

#### Performance Exercise

Tests if query completes within time constraints:

```typescript
{
  type: 'performance',
  validation: {
    strategy: 'performance',
    rules: {
      strategy: 'performance',
      rules: {
        maxExecutionTimeMs: 100
      }
    }
  }
}
```

#### Schema Design Exercise

Tests if user creates correct tables and indexes:

```typescript
{
  type: 'schema-design',
  validation: {
    strategy: 'schema',
    rules: {
      strategy: 'schema',
      rules: {
        tables: {
          required: ['users', 'orders']
        },
        indexes: {
          required: [
            { table: 'users', columns: ['email'] }
          ]
        }
      }
    }
  }
}
```

### 3. Setup SQL

The `setupSql` field creates the environment for the exercise:

```sql
-- Create tables
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  price DECIMAL(10, 2)
);

-- Insert test data
INSERT INTO products (name, price) VALUES
  ('Widget', 9.99),
  ('Gadget', 19.99),
  ('Doohickey', 14.99);

-- Create indexes if needed
CREATE INDEX idx_products_price ON products(price);
```

**Tips**:
- Keep data sets small but representative
- Include edge cases in test data
- Create indexes if the exercise focuses on usage, not creation
- Use realistic data that makes sense

### 4. Hints

Provide 2-4 hints of increasing specificity:

```typescript
hints: [
  'Think about which JOIN type to use',
  'LEFT JOIN includes all rows from the first table',
  'Try: SELECT * FROM orders LEFT JOIN customers ON ...'
]
```

### 5. Explanation

Explain the solution after completion:

```typescript
explanation: 'A LEFT JOIN returns all rows from the left table and matching rows from the right table. NULL values appear where there is no match. This is useful when you want to include all records from one table regardless of whether they have related records in another.'
```

## Creating Evaluation Questions

### 1. Create Question File

Create a JSON file in `curriculum/evaluation/`:

```json
[
  {
    "id": "mc-optimization-1",
    "type": "multiple-choice",
    "difficulty": 5,
    "topic": "optimization",
    "concepts": ["indexes", "query-planning"],
    "prompt": "When would an Index Scan be slower than a Sequential Scan?",
    "setupSql": null,
    "metadata": {
      "timesAsked": 0,
      "timesCorrect": 0,
      "averageTimeSeconds": 0
    },
    "options": [
      { "id": "a", "text": "When the table is very small" },
      { "id": "b", "text": "When selecting most rows from the table" },
      { "id": "c", "text": "When the index is not covering" },
      { "id": "d", "text": "All of the above" }
    ],
    "correctOptionId": "d",
    "explanation": "All these scenarios can make an Index Scan slower than a Sequential Scan. PostgreSQL's query planner considers these factors when choosing the execution plan."
  }
]
```

### 2. Question Types

- `multiple-choice`: Standard MC questions
- `explain-interpret`: Show EXPLAIN output, ask what it means
- `performance-analysis`: Analyze performance metrics
- `sql-write`: Write SQL to solve a problem

### 3. Difficulty Levels

- **1-2**: Basic concepts and definitions
- **3-4**: Practical usage and common patterns
- **5-6**: Intermediate optimization and analysis
- **7-8**: Advanced techniques and edge cases
- **9-10**: Expert-level internals and complex scenarios

### 4. Concept Tags

Tag questions with relevant concepts:

- `fundamentals`
- `data-types`
- `queries`
- `joins`
- `indexes`
- `query-planning`
- `optimization`
- `statistics`
- `monitoring`
- `performance`

## Validation Strategies

### Result Match Validation

Checks query output:

```typescript
{
  rowCount: { exact: 5, min: 1, max: 10 },
  columns: {
    required: ['id', 'name'],
    forbidden: ['password'],
    exactMatch: false
  },
  values: {
    exactMatch: [...], // Exact row data
    subset: [...],     // Must include these rows
    allowExtraRows: true
  },
  ordering: {
    mustMatch: true,
    columnName: 'created_at'
  }
}
```

### Query Plan Validation

Checks EXPLAIN output:

```typescript
{
  mustUseIndex: true,
  specificIndex: 'idx_users_email',
  forbiddenNodes: ['Seq Scan', 'Nested Loop'],
  requiredNodes: ['Index Scan', 'Hash Join'],
  maxCost: 100.0,
  maxRows: 1000
}
```

### Performance Validation

Checks execution metrics:

```typescript
{
  maxExecutionTimeMs: 100,
  maxPlanningTimeMs: 10,
  maxSharedBuffers: 1000,
  requireParallelWorkers: true
}
```

### Schema Validation

Checks database structure:

```typescript
{
  tables: {
    required: ['users', 'orders'],
    forbidden: ['temp_data']
  },
  indexes: {
    required: [
      { table: 'users', columns: ['email'], type: 'btree' },
      { table: 'orders', columns: ['user_id', 'created_at'] }
    ]
  },
  constraints: {
    required: [
      { table: 'users', type: 'primary-key', columns: ['id'] },
      { table: 'orders', type: 'foreign-key', columns: ['user_id'] }
    ]
  }
}
```

## Best Practices

### Lesson Content

1. **Start with Why**: Explain why a concept matters before how it works
2. **Show, Don't Just Tell**: Include examples and demonstrations
3. **Build Incrementally**: Start simple, add complexity gradually
4. **Link Concepts**: Reference related topics and prerequisites
5. **Real-World Context**: Use practical examples users will encounter

### Exercises

1. **Clear Prompts**: State exactly what the user should accomplish
2. **Appropriate Difficulty**: Match exercise difficulty to lesson concepts
3. **Good Test Data**: Representative data that reveals common mistakes
4. **Helpful Feedback**: Error messages should guide users toward solutions
5. **Progressive Hints**: Start general, get more specific

### Evaluation Questions

1. **Single Concept Focus**: Test one thing at a time
2. **Plausible Distractors**: Wrong answers should be reasonable mistakes
3. **Clear Explanations**: Explain why the correct answer is right
4. **Varied Difficulty**: Spread questions across difficulty levels
5. **Tag Accurately**: Use concept tags for weak area targeting

## Testing Your Content

### Test Lessons

1. Read through the lesson yourself
2. Check that all code examples are correct
3. Verify external links work
4. Ensure images (if any) load properly

### Test Exercises

1. Run setup SQL manually to verify it works
2. Test the correct solution
3. Try common wrong approaches to check feedback
4. Verify hints are helpful
5. Check that validation rules work as expected

### Test Questions

1. Answer the question correctly
2. Try each wrong answer
3. Verify explanation makes sense
4. Check difficulty is appropriate
5. Ensure concept tags are accurate

## File Checklist

For each new topic:

- [ ] Created `NN-topic-name/` directory
- [ ] Added `meta.json` with all required fields
- [ ] Created at least one lesson in `lessons/`
- [ ] Created matching exercise file in `exercises/`
- [ ] Defined exercises with proper validation
- [ ] Added hints and explanations
- [ ] Tested exercises manually
- [ ] Added evaluation questions if appropriate
- [ ] Updated curriculum OUTLINE.md if needed

## Getting Help

If you have questions about curriculum authoring:
1. Review existing topics for examples
2. Check the TypeScript types in `packages/shared/src/types/`
3. Look at the curriculum service code for how content is loaded
4. Open an issue on GitHub for clarification
