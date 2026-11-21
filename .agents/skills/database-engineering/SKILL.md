---
name: database-engineering
description: Design safe schemas, migrations, transactions, constraints, indexes, and reliable data access.
metadata:
  domain: data
  triggers: schema, migration, query, index, transaction
  prerequisites: the database engine and schema files
  outputs: a migration or query change with a rollback
  priority: task
---

# Database Engineering

## Read first
Use when: tables, schemas, migrations, queries, indexes or transactions change.
Not when: analysis numbers or data pipelines (data-engineering-analytics); only the API around the data (backend-api).
Must do: read the current schema and migrations first; parameterized queries only; reversible migrations; approval and a backup plan before anything destructive.
Done when: the migration ran on a disposable database and the report states data-loss risk and what was not verified.
Stop here if: the user only wants a schema design reviewed.
Read on only for: "Queries and transactions" for speed or races, "Migrations and operations" before running one.

## Order of work
1. Read the current schema, ORM models, and migrations.
2. Design the smallest change that meets the requirement.
3. Write the migration and the queries it affects.
4. Apply it to a disposable database and check the result.
5. Report using the format at the end.

## Design
- Inspect the existing database, ORM, schema conventions, and migrations before changing data structures.
- Model entities and relationships from actual requirements; avoid speculative tables and fields.
- Use appropriate primary keys, foreign keys, nullability, uniqueness, and check constraints.
- Normalize by default; denormalize only for a measured and explained reason.
- Represent money, time zones, and identifiers with suitable types. Store times consistently and make display conversions explicit.

## Queries and transactions
- Use the project's ORM safely or parameterized SQL; never concatenate untrusted input into SQL.
- Inspect query count and execution plans when performance is a concern.
- Add indexes for measured or predictable access patterns while considering write cost.
- Use transactions for operations that must succeed or fail together.
- Plan concurrency behavior and use constraints/locking/atomic updates when races matter.
- Paginate unbounded result sets and avoid N+1 query patterns.

## Migrations and operations
- Make migrations reviewable, reversible where practical, and compatible with deployment order.
- For destructive changes, confirm backups, rollback strategy, and explicit approval.
- Never test destructive migration steps against production data without authorization.
- Keep credentials out of code and logs; use least-privilege database accounts.
- Verify migrations against a disposable or staging database when available.

## Report
Explain schema choices, data-loss risks, query behavior, migration steps, checks actually run, and anything not verified.
