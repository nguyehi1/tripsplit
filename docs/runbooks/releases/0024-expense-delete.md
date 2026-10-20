# Release migration 0024: expense delete

Release checks for migration 0024 (`expense-delete-and-polish`). Follow these in order. For how delete and erase work, see [Mutations](../../architecture/mutations.md#deleting-an-expense).

**Order: apply migration 0024 BEFORE deploying the app.** New code calls `delete_expense` and
`undo_delete_expense`, and the Delete button fails against an unmigrated database. (Old code against
the new schema is safe, but the direct `delete` on `expenses` it never used is now revoked.)

After applying 0024:

1. **pg_cron.** The migration emits a `NOTICE` ("pg_cron not enabled; erase_expired_expenses is NOT
   scheduled") if the extension is missing and still succeeds. Enable `pg_cron` (Database >
   Extensions) and re-run the final `cron.schedule` block of 0024. A Vercel cron fallback is not
   built. Then confirm the job:

   ```sql
   select jobname, schedule, active from cron.job where jobname = 'erase-expired-expenses';
   ```

   Expect one active row with schedule `* * * * *`.
2. **No realtime publication.** Expect zero rows:

   ```sql
   select * from pg_publication_tables where tablename in ('expenses', 'shopping_list_items');
   ```
3. **Smoke test** delete and Undo through the real API, then deploy.

After the release, set up the daily check in [Monitor the expense erase job](../monitor-expense-erase.md).

## Related

- [Apply a schema change](../../guides/apply-a-schema-change.md)
- [ADR 0017](../../adr/0017-expense-delete-soft-mark-then-erase.md)
- [Runbooks](../README.md)

Last verified: 2026-10-20 against 9a951bb
