# Apply a schema change

Write, test and release a Supabase migration without breaking the running app. A migration and a Vercel deploy are not atomic, so old code can run against the new schema, and new code can run against the old one, for a window.

## Choose the direction of risk

| Change | Safe order | Why |
|---|---|---|
| Add a nullable column, or a column with an always-correct default | Migration, then app | Old code ignores the column. |
| Add a `not null` column to a populated table | Migration (phased as below), then app | Old code that does not send the column must still succeed. |
| Loosen `not null` to nullable | Migration, then app | Old code is unaffected. |
| App code **selects** a new column | **Migration first, confirmed, then deploy** | A missing column fails the whole read. |
| Add or change an RPC the app calls | Migration first, then app | New code against the old schema fails. |

Old code against the new schema is the safe direction. New code against the old schema is the dangerous one.

## Steps

1. **Write the migration** as `supabase/migrations/NNNN_<description>.sql` with the next sequential number. Migrations are never edited after merge. Make the DDL idempotent so a retried apply succeeds.

2. **Phase a `not null` column** inside one migration file: add it nullable, backfill, set a database-level default, then set `not null`. The default keeps inserts from not-yet-redeployed code succeeding until the new frontend is live. See `supabase/migrations/0007_add_expense_date.sql` and [ADR 0003](../adr/0003-expense-date-column-sequencing.md).

3. **Put validation in `CHECK` constraints**, not only in an RPC, when a direct `INSERT` policy can reach the table. Write each check and test the exact rows it should accept and reject (one, two and three types, not only the empty and full cases).

4. **Test policies at scale.** Run any new or changed RLS policy against a large synthetic table, not only the small development database. See [Performance](../architecture/performance.md#rls-and-indexing).

5. **Add a verification script** at `supabase/verify/<migration>.verify.sql` that is read-only and returns an `ok` column per check, plus a live test if the change adds an RPC or policy.

6. **Order the release.** Apply the migration to the live database **before** merging or deploying app code that depends on it. Prefer a separate, earlier merge for the migration.

7. **Confirm** the migration landed (run the verify script and save its output with the feature's QA report), then deploy the app.

8. **Roll back** by redeploying the previous build. Leave the added columns in place.

If the migration schedules a `pg_cron` job, it prints a `NOTICE` and still succeeds when the extension is missing. Enable `pg_cron` and re-run the scheduling block, then confirm with `select * from cron.job;`.

## Release checklists

Releases that need extra steps have their own pages:

- [Migration 0022: trip types](../runbooks/releases/0022-trip-types.md)
- [Migration 0024: expense delete and erase](../runbooks/releases/0024-expense-delete.md)

## Related

- [Data model](../reference/data-model.md)
- [Mutations](../architecture/mutations.md)
- [ADR 0003](../adr/0003-expense-date-column-sequencing.md)

Last verified: 2026-10-20 against 9a951bb
