# Monitor the expense erase job

Check daily that deleted expenses are being hard-erased. Without the `pg_cron` job, nothing erases a deleted row while the app is idle.

## Background

A payer can delete their own expense on an open trip. `delete_expense` marks it (`deleted_at`, database
clock) and row-level security hides it at once. `undo_delete_expense` works for 15 seconds on the
server (the app's Undo toast shows 10). `erase_expired_expenses()` hard-erases rows older than 30
seconds, run by pg_cron every minute (job `erase-expired-expenses`) plus a small opportunistic batch
inside each delete/Undo. With pg_cron running, a deleted expense is gone at most about 2 minutes
after the delete. Erase leaves no audit trail (counsel question open, non-blocking). See
[ADR 0017](../adr/0017-expense-delete-soft-mark-then-erase.md).

## Daily check

Owner: the project owner (Hien Nguyen). Frequency: daily. Expected
result is `overdue = 0`; any row older than 10 minutes means the job is down:

```sql
select count(*) as overdue, min(deleted_at) as oldest
from public.expenses
where deleted_at is not null and deleted_at < now() - interval '10 minutes';
select jobname, schedule, active from cron.job where jobname = 'erase-expired-expenses';
```

If overdue is above 0 or the job is missing or inactive, fix the schedule and clear the backlog with
`select public.erase_expired_expenses();` as the postgres owner (up to 500 rows per call; repeat
until overdue is 0).

**The 24-hour cap is an operational commitment, not a code guarantee.** Hiding and balance
correctness are enforced by the database regardless. But if pg_cron is absent and the app is idle,
nothing erases the row; only this daily check bounds retention of the expense text to 24 hours.

## Account deletion interplay

A recently deleted expense blocks a user delete until it is erased. See "Before case A or B" in [Delete an account](delete-an-account.md). The export behavior for rows inside the erase window is in [Export a user's data](export-user-data.md).

## Related

- [Release 0024: expense delete](releases/0024-expense-delete.md)
- [ADR 0017](../adr/0017-expense-delete-soft-mark-then-erase.md)
- [Runbooks](README.md)

Last verified: 2026-10-20 against 9a951bb
