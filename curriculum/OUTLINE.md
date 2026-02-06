# PostgreSQL Learning Curriculum

## Overview

This curriculum provides a structured path for mastering PostgreSQL, from foundational concepts through advanced query optimization, operational monitoring, and performance tuning. The curriculum is designed to build knowledge progressively, with each section building upon previous concepts.

## Learning Path Summary

```
Level 1: Foundations → Level 2: Advanced Queries → Level 3: Internals & Optimization → Level 4: Production Operations
```

**Estimated Timeline**: 8-12 weeks for comprehensive mastery

---

## Level 1: Foundational Topics

**Prerequisites**: Basic SQL knowledge, understanding of relational database concepts
**Duration**: 2-3 weeks

### 1.1 PostgreSQL Basics

**Subtopics**:
- Installation and configuration (postgresql.conf, pg_hba.conf)
- Database architecture (processes, memory structures, storage)
- psql command-line interface and essential commands
- Database and schema management
- User roles, privileges, and security fundamentals

**Learning Objectives**:
- Set up a local PostgreSQL instance
- Navigate the PostgreSQL ecosystem
- Understand the server architecture
- Manage basic security and access control

**Recommended Resources**:
- Official PostgreSQL documentation
- Hands-on: Create databases, users, and schemas

---

### 1.2 Data Types and Constraints

**Subtopics**:
- Numeric types (INTEGER, NUMERIC, SERIAL, etc.)
- Character types (CHAR, VARCHAR, TEXT)
- Temporal types (DATE, TIME, TIMESTAMP, INTERVAL)
- Special types (JSON/JSONB, ARRAY, HSTORE, UUID)
- Constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, NOT NULL)

**Learning Objectives**:
- Choose appropriate data types for different use cases
- Understand storage implications of type choices
- Implement data integrity through constraints
- Work with PostgreSQL-specific types (JSONB, arrays)

**Hands-on Exercise**:
- Design a schema for a sample application
- Implement all constraint types

---

### 1.3 Basic Queries (CRUD Operations)

**Subtopics**:
- SELECT statements and filtering (WHERE, DISTINCT)
- INSERT, UPDATE, DELETE operations
- Sorting and limiting results (ORDER BY, LIMIT, OFFSET)
- Aggregate functions (COUNT, SUM, AVG, MIN, MAX)
- GROUP BY and HAVING clauses

**Learning Objectives**:
- Write efficient single-table queries
- Perform data manipulation operations
- Use aggregate functions effectively
- Understand query execution flow

**Hands-on Exercise**:
- Build a sample dataset
- Write 20+ queries of increasing complexity

---

### 1.4 Joins and Relationships

**Subtopics**:
- INNER JOIN and equi-joins
- LEFT/RIGHT/FULL OUTER JOINs
- CROSS JOIN and Cartesian products
- Self-joins and recursive relationships
- Join performance considerations

**Learning Objectives**:
- Understand different join types and when to use each
- Write multi-table queries
- Recognize join performance implications
- Design normalized database schemas

**Hands-on Exercise**:
- Create a multi-table schema with relationships
- Write queries using all join types
- Compare execution plans for different join strategies

---

### 1.5 Transactions and Concurrency

**Subtopics**:
- ACID properties and transaction basics
- BEGIN, COMMIT, ROLLBACK statements
- Transaction isolation levels (READ COMMITTED, REPEATABLE READ, SERIALIZABLE)
- Locking mechanisms (row-level, table-level)
- Deadlock detection and prevention

**Learning Objectives**:
- Understand transaction guarantees
- Choose appropriate isolation levels
- Avoid common concurrency issues
- Handle transaction failures gracefully

**Hands-on Exercise**:
- Simulate concurrent transactions
- Observe different isolation behaviors
- Create and resolve deadlock scenarios

---

## Level 2: Advanced Query Topics

**Prerequisites**: Completion of Level 1
**Duration**: 2 weeks

### 2.1 Subqueries and Derived Tables

**Subtopics**:
- Scalar subqueries in SELECT and WHERE
- Correlated vs. non-correlated subqueries
- EXISTS and NOT EXISTS patterns
- IN and ANY/ALL operators
- Subquery materialization and performance

**Learning Objectives**:
- Write complex nested queries
- Understand when subqueries are materialized
- Know when to use subqueries vs. joins
- Recognize subquery performance patterns

**Hands-on Exercise**:
- Rewrite subqueries as joins and vice versa
- Compare execution plans
- Optimize slow subqueries

---

### 2.2 Common Table Expressions (CTEs)

**Subtopics**:
- Basic WITH clause syntax
- Multiple CTEs and chaining
- Recursive CTEs for hierarchical data
- Materialized vs. inline CTEs (MATERIALIZED keyword)
- CTE optimization fence and performance implications

**Learning Objectives**:
- Write readable complex queries using CTEs
- Implement recursive queries for tree structures
- Understand CTE materialization behavior
- Use MATERIALIZED/NOT MATERIALIZED hints appropriately

**Hands-on Exercise**:
- Build organizational hierarchy queries
- Create bill-of-materials queries
- Compare CTE vs. subquery performance

---

### 2.3 Window Functions

**Subtopics**:
- Window function syntax (OVER clause, PARTITION BY, ORDER BY)
- Ranking functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)
- Aggregate window functions (SUM, AVG, COUNT with OVER)
- Frame specifications (ROWS BETWEEN, RANGE BETWEEN)
- Lead/lag and offset functions (LEAD, LAG, FIRST_VALUE, LAST_VALUE)

**Learning Objectives**:
- Perform analytics without self-joins
- Understand partition and frame concepts
- Write efficient ranking and running total queries
- Use window functions for time-series analysis

**Hands-on Exercise**:
- Calculate running totals and moving averages
- Implement ranking with ties
- Compare window functions vs. self-joins

---

### 2.4 Advanced Data Manipulation

**Subtopics**:
- UPSERT operations (INSERT ... ON CONFLICT)
- RETURNING clause for DML operations
- Bulk operations and COPY command
- UPDATE ... FROM and DELETE ... USING
- Modifying CTEs (data-modifying CTEs)

**Learning Objectives**:
- Handle insert conflicts gracefully
- Perform efficient bulk operations
- Chain multiple DML operations
- Return affected rows from modifications

**Hands-on Exercise**:
- Implement idempotent data loading
- Build ETL processes with COPY
- Use RETURNING for audit logging

---

### 2.5 Set Operations and Advanced Filtering

**Subtopics**:
- UNION, UNION ALL, INTERSECT, EXCEPT
- Complex WHERE conditions and boolean logic
- CASE expressions and conditional logic
- Pattern matching (LIKE, ILIKE, regular expressions)
- Array operations and operators

**Learning Objectives**:
- Combine result sets effectively
- Write complex conditional logic
- Use PostgreSQL-specific operators
- Understand set operation performance

**Hands-on Exercise**:
- Compare UNION vs. UNION ALL performance
- Build complex filtering logic
- Use array containment operators

---

## Level 3: Query Planner Internals and Optimization

**Prerequisites**: Completion of Levels 1-2
**Duration**: 3-4 weeks

### 3.1 Query Planner Architecture

**Subtopics**:
- Query lifecycle (parsing, rewriting, planning, execution)
- Planner/optimizer architecture
- Cost-based vs. rule-based optimization
- Plan node types and their characteristics
- Planner configuration parameters (enable_* GUCs)

**Learning Objectives**:
- Understand how PostgreSQL processes queries
- Recognize different plan node types
- Know when the planner chooses specific algorithms
- Understand planner limitations and workarounds

**Hands-on Exercise**:
- Read EXPLAIN output systematically
- Disable planner features to observe alternatives
- Compare costs across different plan choices

---

### 3.2 Understanding EXPLAIN and Plan Nodes

**Subtopics**:
- EXPLAIN vs. EXPLAIN ANALYZE vs. EXPLAIN (ANALYZE, BUFFERS)
- Reading execution plans (node hierarchy, costs, rows)
- Common plan nodes (Seq Scan, Index Scan, Hash Join, Merge Join, etc.)
- Parallel query execution (Parallel Seq Scan, Gather nodes)
- Materialization points and sorting operations

**Learning Objectives**:
- Read and interpret execution plans fluently
- Identify performance bottlenecks in plans
- Understand actual vs. estimated row counts
- Recognize when parallelism is used

**Deep Dive Topics**:
- Sequential Scan: When and why used, costs involved
- Index Scan vs. Index Only Scan: Visibility map, heap fetches
- Bitmap Index Scan: Combining multiple indexes
- Hash Join: Hash table construction, memory usage
- Merge Join: Sort requirements, when optimal
- Nested Loop: Join order, small outer tables
- Aggregate nodes: HashAggregate vs. GroupAggregate

**Hands-on Exercise**:
- Analyze 20+ different execution plans
- Predict plan choices before running EXPLAIN
- Identify row count estimation errors

---

### 3.3 PostgreSQL Statistics System

**Subtopics**:
- Table statistics (pg_class: reltuples, relpages)
- Column statistics (pg_stats view: null_frac, n_distinct, histogram_bounds, correlation)
- Multi-column statistics (CREATE STATISTICS)
- ANALYZE command and auto-analyze
- Statistics target (ALTER TABLE ... SET STATISTICS)

**Learning Objectives**:
- Understand what statistics PostgreSQL collects
- Read pg_stats to diagnose planning issues
- Configure statistics collection appropriately
- Use extended statistics for correlated columns

**Deep Dive Topics**:
- How n_distinct affects hash join memory
- How correlation affects index scan cost estimates
- How histogram_bounds drives selectivity estimates
- Most common values (MCV) lists and their impact
- Statistics staleness and planning consequences

**Hands-on Exercise**:
- Examine pg_stats for various column types
- Observe planning changes after ANALYZE
- Create extended statistics for correlated columns
- Identify stale statistics causing bad plans

---

### 3.4 Query Optimization Techniques

**Subtopics**:
- Query rewriting strategies (subquery to join conversion)
- Join order optimization and join elimination
- Partition pruning and constraint exclusion
- Expression evaluation and constant folding
- Index condition pushdown and filter ordering

**Learning Objectives**:
- Write queries that optimize well
- Understand automatic query transformations
- Leverage constraints for optimization
- Recognize optimization opportunities

**Deep Dive Topics**:
- When subqueries are pulled up vs. materialized
- How join_collapse_limit affects planning time
- Partition-wise join and aggregation
- Common table expression optimization fence
- Predicate pushdown in subqueries and CTEs

**Hands-on Exercise**:
- Rewrite queries to improve plans
- Use MATERIALIZED hints strategically
- Configure partitioning for pruning
- Measure planning time vs. execution time tradeoffs

---

### 3.5 Statistics Maintenance and Tuning

**Subtopics**:
- Auto-vacuum and auto-analyze configuration
- Manual ANALYZE strategies for large tables
- Statistics target tuning for critical columns
- Detecting and fixing statistics issues
- Monitoring statistics freshness

**Learning Objectives**:
- Configure auto-analyze appropriately
- Identify when statistics are stale or insufficient
- Tune statistics collection for workload
- Balance statistics accuracy vs. collection cost

**Configuration Parameters**:
- default_statistics_target
- autovacuum_analyze_scale_factor
- autovacuum_analyze_threshold
- track_counts (prerequisite for autovacuum)

**Hands-on Exercise**:
- Monitor auto-analyze behavior
- Tune statistics target for specific columns
- Create maintenance schedules for large tables
- Diagnose poor plans from inadequate statistics

---

## Level 4: Operational Health and Performance

**Prerequisites**: Completion of Levels 1-3
**Duration**: 2-3 weeks

### 4.1 Performance Monitoring with pg_stat Views

**Subtopics**:
- pg_stat_activity: Current connections and active queries
- pg_stat_database: Database-level statistics
- pg_stat_user_tables: Table access patterns (seq_scan, idx_scan, etc.)
- pg_stat_user_indexes: Index usage and effectiveness
- pg_statio_* views: I/O statistics

**Learning Objectives**:
- Monitor active workloads in real-time
- Identify long-running and blocked queries
- Track table and index usage patterns
- Measure cache hit ratios

**Key Queries**:
- Finding active queries and their wait events
- Identifying tables with high sequential scans
- Detecting unused or rarely-used indexes
- Calculating buffer cache hit ratios

**Hands-on Exercise**:
- Build a monitoring dashboard query set
- Identify problematic query patterns
- Track workload changes over time

---

### 4.2 Query Performance Analysis

**Subtopics**:
- pg_stat_statements extension for query tracking
- Identifying slow queries and resource hogs
- Query fingerprinting and normalization
- Execution time analysis (mean, stddev, max)
- Calls and total time metrics

**Learning Objectives**:
- Enable and configure pg_stat_statements
- Identify most expensive queries
- Track query performance over time
- Prioritize optimization efforts

**Key Queries**:
- Top queries by total time
- Top queries by mean time
- Queries with high standard deviation
- Most frequently called queries

**Hands-on Exercise**:
- Install and configure pg_stat_statements
- Build performance report queries
- Correlate slow queries with business impact

---

### 4.3 Index Design Fundamentals

**Subtopics**:
- Index types: B-tree, Hash, GiST, GIN, BRIN, SP-GiST
- B-tree index internals and use cases (equality, range, sorting)
- GIN indexes for full-text search and JSONB
- BRIN indexes for large sequential tables
- Partial indexes and filtered indexing
- Expression indexes and functional indexing

**Learning Objectives**:
- Choose appropriate index type for query patterns
- Understand index storage and maintenance costs
- Create targeted indexes with WHERE clauses
- Index computed values and expressions

**Index Type Decision Matrix**:
- B-tree: Default, equality/range, sorting, most data types
- Hash: Equality only, slightly faster than B-tree for =
- GIN: Multi-value types (arrays, JSONB, full-text)
- GiST: Geometric data, full-text, range types
- BRIN: Large tables with natural ordering (time-series)
- SP-GiST: Specialized spatial and non-balanced trees

**Hands-on Exercise**:
- Create indexes of each type
- Measure query performance improvement
- Compare index size vs. benefit
- Build partial indexes for common filters

---

### 4.4 Missing Index Detection

**Subtopics**:
- Analyzing pg_stat_user_tables for sequential scans
- Identifying missing indexes from query patterns
- Using EXPLAIN to detect full table scans
- Correlating slow queries with missing indexes
- Index recommendations and validation

**Learning Objectives**:
- Systematically identify missing index opportunities
- Distinguish helpful from wasteful indexes
- Validate index effectiveness before creating
- Balance index benefits vs. maintenance costs

**Detection Techniques**:
- Tables with high seq_scan/idx_scan ratio
- Sequential scans on large tables (seq_scan * reltuples)
- WHERE clause analysis in pg_stat_statements
- JOIN column index coverage
- ORDER BY clause index support

**Hands-on Exercise**:
- Query pg_stat_user_tables for index candidates
- Analyze common query patterns for indexing needs
- Use EXPLAIN to verify index usage before creation
- Create indexes and measure impact

---

### 4.5 Index Maintenance and Optimization

**Subtopics**:
- Index bloat detection and remediation
- REINDEX operations and strategies
- Multi-column indexes and column order
- Index-only scans and covering indexes
- INCLUDE clause for covering non-key columns

**Learning Objectives**:
- Monitor index health and bloat
- Optimize multi-column index design
- Enable index-only scans through covering
- Maintain indexes efficiently

**Key Concepts**:
- Column order in composite indexes (high selectivity first)
- INCLUDE for covering without increasing key size
- Visibility map for index-only scans
- Concurrent index creation (CREATE INDEX CONCURRENTLY)

**Hands-on Exercise**:
- Detect and fix bloated indexes
- Optimize multi-column index column order
- Create covering indexes with INCLUDE
- Measure index-only scan performance gains

---

### 4.6 Operational Health Monitoring

**Subtopics**:
- Connection and session monitoring
- Lock monitoring and deadlock analysis
- Bloat monitoring (table and index bloat)
- Replication lag and streaming status
- Disk space and growth trends

**Learning Objectives**:
- Monitor production database health
- Detect and resolve lock contention
- Track bloat and plan maintenance
- Monitor replication health

**Key Queries and Views**:
- pg_locks and lock wait trees
- pgstattuple extension for bloat detection
- pg_stat_replication for replication monitoring
- pg_database_size() and pg_total_relation_size()

**Hands-on Exercise**:
- Build operational health dashboard
- Simulate and detect lock contention
- Monitor bloat accumulation
- Create alerting thresholds

---

### 4.7 Performance Tuning Methodology

**Subtopics**:
- Performance tuning workflow (measure, analyze, optimize, validate)
- Memory configuration (shared_buffers, work_mem, maintenance_work_mem)
- WAL and checkpoint tuning
- Connection pooling strategies
- Resource consumption limits

**Learning Objectives**:
- Apply systematic performance tuning approach
- Configure PostgreSQL for workload characteristics
- Balance memory allocation across uses
- Avoid common configuration mistakes

**Key Configuration Parameters**:
- shared_buffers: Main cache size (15-25% of RAM)
- work_mem: Per-operation memory for sorts/hashes
- maintenance_work_mem: VACUUM, CREATE INDEX memory
- effective_cache_size: Planner hint for OS cache
- random_page_cost vs. seq_page_cost: SSD tuning

**Hands-on Exercise**:
- Benchmark different configuration settings
- Tune parameters for specific workload
- Measure impact of configuration changes
- Create tuning playbook for common scenarios

---

### 4.8 Troubleshooting Common Issues

**Subtopics**:
- Slow query diagnosis and resolution
- High CPU usage investigation
- Memory exhaustion and OOM issues
- Connection limit problems
- Vacuum and bloat issues

**Learning Objectives**:
- Diagnose common production problems
- Use systematic troubleshooting approach
- Gather relevant diagnostic information
- Implement fixes and verify resolution

**Troubleshooting Toolkit**:
- pg_stat_activity for current state
- pg_stat_statements for historical queries
- EXPLAIN ANALYZE for query diagnosis
- pg_locks for contention issues
- Log analysis (log_min_duration_statement)

**Hands-on Exercise**:
- Simulate common production issues
- Practice diagnostic data collection
- Implement fixes and measure results
- Create runbooks for common problems

---

## Level 5: Advanced Topics

**Prerequisites**: Completion of Levels 1-4
**Duration**: 2-3 weeks

### 5.1 Partitioning Strategies

**Subtopics**:
- Declarative partitioning (PARTITION BY RANGE/LIST/HASH)
- Partition pruning and constraint exclusion
- Partition-wise join and aggregation
- Partition maintenance (ATTACH/DETACH)
- Migration from inheritance-based partitioning

**Learning Objectives**:
- Design effective partitioning schemes
- Leverage partition pruning for query performance
- Maintain partitioned tables efficiently
- Balance partition count and size

**Hands-on Exercise**:
- Create range-partitioned time-series tables
- Implement automated partition management
- Measure partition pruning effectiveness
- Compare partitioned vs. non-partitioned performance

---

### 5.2 Replication and High Availability

**Subtopics**:
- Streaming replication architecture
- Synchronous vs. asynchronous replication
- Logical replication and publication/subscription
- Failover and promotion strategies
- Replication slots and WAL retention

**Learning Objectives**:
- Set up streaming replication
- Configure appropriate replication mode
- Monitor replication lag
- Perform failover procedures

**Hands-on Exercise**:
- Build streaming replication cluster
- Configure synchronous replication
- Set up logical replication for selective tables
- Practice failover scenarios

---

### 5.3 Backup and Recovery

**Subtopics**:
- Physical backups (pg_basebackup)
- Logical backups (pg_dump, pg_dumpall)
- Point-in-time recovery (PITR)
- WAL archiving and continuous archiving
- Backup validation and testing

**Learning Objectives**:
- Implement comprehensive backup strategy
- Perform point-in-time recovery
- Validate backup integrity
- Balance backup methods for different needs

**Hands-on Exercise**:
- Configure WAL archiving
- Perform pg_basebackup
- Execute point-in-time recovery
- Test backup restoration procedures

---

### 5.4 Extensions and Advanced Features

**Subtopics**:
- Popular extensions (pg_stat_statements, pgcrypto, pg_trgm)
- Full-text search (tsvector, tsquery, text search configurations)
- Foreign Data Wrappers (postgres_fdw, file_fdw)
- Custom aggregate and window functions
- PL/pgSQL and procedural languages

**Learning Objectives**:
- Leverage extensions for common needs
- Implement full-text search
- Access external data sources
- Write custom functions and aggregates

**Hands-on Exercise**:
- Install and configure popular extensions
- Build full-text search functionality
- Connect to external data with FDW
- Create custom aggregation functions

---

### 5.5 Security Hardening

**Subtopics**:
- Authentication methods (md5, scram-sha-256, certificate)
- Row-level security (RLS) policies
- Column-level encryption
- SSL/TLS configuration
- Audit logging with pgaudit

**Learning Objectives**:
- Implement defense-in-depth security
- Configure strong authentication
- Use RLS for multi-tenant applications
- Enable comprehensive audit logging

**Hands-on Exercise**:
- Configure SSL/TLS connections
- Implement row-level security policies
- Set up pgaudit extension
- Create security compliance checklist

---

## Recommended Learning Order

### Phase 1: Foundation (Weeks 1-3)
1. PostgreSQL Basics (1.1)
2. Data Types and Constraints (1.2)
3. Basic Queries (1.3)
4. Joins and Relationships (1.4)
5. Transactions and Concurrency (1.5)

### Phase 2: Advanced Queries (Weeks 4-5)
6. Subqueries and Derived Tables (2.1)
7. Common Table Expressions (2.2)
8. Window Functions (2.3)
9. Advanced Data Manipulation (2.4)
10. Set Operations (2.5)

### Phase 3: Internals and Optimization (Weeks 6-9)
11. Query Planner Architecture (3.1)
12. Understanding EXPLAIN and Plan Nodes (3.2)
13. PostgreSQL Statistics System (3.3)
14. Query Optimization Techniques (3.4)
15. Statistics Maintenance and Tuning (3.5)

### Phase 4: Operations and Performance (Weeks 10-12)
16. Performance Monitoring with pg_stat Views (4.1)
17. Query Performance Analysis (4.2)
18. Index Design Fundamentals (4.3)
19. Missing Index Detection (4.4)
20. Index Maintenance and Optimization (4.5)
21. Operational Health Monitoring (4.6)
22. Performance Tuning Methodology (4.7)
23. Troubleshooting Common Issues (4.8)

### Phase 5: Advanced Topics (Weeks 13-15, Optional)
24. Partitioning Strategies (5.1)
25. Replication and High Availability (5.2)
26. Backup and Recovery (5.3)
27. Extensions and Advanced Features (5.4)
28. Security Hardening (5.5)

---

## Practical Projects

To reinforce learning, complete these projects as you progress:

### Project 1: E-commerce Database (Weeks 1-3)
- Design normalized schema for products, orders, customers
- Implement all constraint types
- Write complex queries with joins
- Practice transaction handling

### Project 2: Analytics Dashboard (Weeks 4-5)
- Build reporting queries with window functions
- Create materialized views for performance
- Implement data aggregation pipelines
- Use CTEs for complex analytics

### Project 3: Query Optimization Lab (Weeks 6-9)
- Analyze slow queries from real workload
- Read and interpret execution plans
- Tune statistics for better planning
- Rewrite queries for performance
- Document optimization methodology

### Project 4: Production Monitoring System (Weeks 10-12)
- Build comprehensive monitoring dashboard
- Implement index analysis and recommendations
- Create performance baseline and alerting
- Document operational runbooks
- Practice troubleshooting scenarios

### Project 5: High-Availability Setup (Weeks 13-15)
- Configure streaming replication
- Implement automated backups
- Set up monitoring and alerting
- Practice failover procedures
- Document disaster recovery plan

---

## Assessment Checkpoints

### Checkpoint 1: Foundation (End of Week 3)
- Can you design a normalized schema with appropriate data types?
- Can you write complex joins and aggregate queries?
- Do you understand transaction isolation levels?

### Checkpoint 2: Advanced Queries (End of Week 5)
- Can you write recursive CTEs for hierarchical data?
- Can you solve analytics problems with window functions?
- Can you choose between subqueries, joins, and CTEs appropriately?

### Checkpoint 3: Internals (End of Week 9)
- Can you read and interpret execution plans fluently?
- Do you understand how statistics affect query planning?
- Can you identify and fix row count estimation errors?
- Can you rewrite queries to improve execution plans?

### Checkpoint 4: Operations (End of Week 12)
- Can you identify missing indexes systematically?
- Can you diagnose performance problems using pg_stat views?
- Can you tune configuration for specific workloads?
- Can you troubleshoot common production issues?

### Checkpoint 5: Mastery (End of Week 15)
- Can you design and implement a production-grade system?
- Can you handle complex operational scenarios?
- Can you optimize queries using all available techniques?
- Can you mentor others on PostgreSQL best practices?

---

## Essential Tools and Resources

### Tools
- **psql**: Official command-line interface
- **pgAdmin**: GUI administration tool
- **DBeaver**: Universal database client
- **pgBench**: Benchmarking tool
- **explain.depesz.com**: Visual EXPLAIN analyzer
- **pev2**: Another excellent plan visualizer

### Extensions to Install
- **pg_stat_statements**: Query performance tracking (essential)
- **pgstattuple**: Bloat analysis
- **pg_trgm**: Fuzzy text matching and GIN indexes
- **pgcrypto**: Cryptographic functions
- **btree_gin/btree_gist**: Composite index types

### Documentation
- Official PostgreSQL documentation (postgresql.org/docs)
- PostgreSQL Wiki (wiki.postgresql.org)
- Use The Index, Luke (use-the-index-luke.com)
- Postgres.fm podcast for advanced topics

### Community Resources
- PostgreSQL mailing lists
- #postgresql on Libera.Chat IRC
- r/PostgreSQL on Reddit
- PostgreSQL Conference recordings (YouTube)

---

## Best Practices Summary

### Query Writing
- Use explicit JOIN syntax, avoid implicit joins in WHERE
- Prefer CTEs for readability, but watch for optimization fences
- Always include ORDER BY when order matters
- Use prepared statements to avoid SQL injection
- Leverage RETURNING clause to reduce round trips

### Statistics and Planning
- Run ANALYZE after bulk data loads
- Increase statistics target for columns in complex queries
- Create extended statistics for correlated columns
- Monitor pg_stat_user_tables for stale statistics
- Understand when to use MATERIALIZED in CTEs

### Index Design
- Index foreign key columns used in joins
- Index columns in WHERE, ORDER BY, and GROUP BY
- Consider covering indexes for critical queries
- Use partial indexes for filtered queries
- Monitor index usage and remove unused indexes

### Performance
- Set work_mem appropriately for your workload
- Use connection pooling (pgBouncer, pgPool)
- Monitor and tune checkpoint settings
- Configure shared_buffers (15-25% of RAM)
- Regular VACUUM and ANALYZE maintenance

### Operations
- Enable pg_stat_statements in production
- Monitor replication lag continuously
- Set up automated backups and test restores
- Implement bloat monitoring and remediation
- Use log_min_duration_statement to find slow queries

---

## Conclusion

This curriculum provides a comprehensive path from PostgreSQL fundamentals to expert-level optimization and operational skills. The focus on query planner internals, statistics, index design, and operational monitoring prepares you for real-world production database management.

Key success factors:
- **Hands-on practice**: Reading about concepts isn't enough; you must run queries, analyze plans, and measure performance
- **Progressive learning**: Each level builds on previous knowledge; don't skip ahead
- **Real-world application**: Apply concepts to actual projects and problems
- **Community engagement**: Join PostgreSQL communities to learn from experienced practitioners
- **Continuous learning**: PostgreSQL evolves with each version; stay current with new features

Master these topics, and you'll be equipped to design, optimize, and operate PostgreSQL databases at any scale.
