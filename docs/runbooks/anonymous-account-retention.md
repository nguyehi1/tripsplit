# Anonymous-account retention

Unverified anonymous accounts are purged automatically after a period of inactivity. This page covers how the job works, how to set it up, and how to change the period.

## How it works

`public.purge_abandoned_anonymous_users(90)` runs daily via pg_cron. It deletes unverified
anonymous users inactive 90 days, skipping any that paid expenses or organize a trip with other
members or expenses. Their trips go with them (cascade through `created_by`), including
`other_type`. Dry run the candidate count by copying the CTE `doomed` and selecting count.
Changing the period: update the cron command, `ANON_RETENTION_DAYS` in `src/lib/legal.ts`, and
the privacy page copy together.

## Set up the schedule

- Supabase dashboard: Database > Extensions > enable `pg_cron`, then re-run the last block of
  migration 0018 (or `select cron.schedule('purge-abandoned-anonymous-users', '17 3 * * *',
  'select public.purge_abandoned_anonymous_users(90)')`). Verify with `select * from cron.job;`. Migration 0024 also
  schedules `erase-expired-expenses` ([Monitor the expense erase job](monitor-expense-erase.md)).

## Related

- [Runbooks](README.md)
- [Data model](../reference/data-model.md#scheduled-jobs-pg_cron-optional)

Last verified: 2026-10-20 against 9a951bb
