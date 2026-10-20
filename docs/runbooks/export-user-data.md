# Export a user's data

Produce a JSON copy of everything held about one account and send it to the verified requester. Verify the requester first ([Runbooks](README.md#verify-the-requester)).

## Steps

Find the user id: `select id from auth.users where email = '<email>';`

```sql
select jsonb_build_object(
  'account',   (select to_jsonb(u) - 'encrypted_password' from (select id, email, created_at from auth.users where id = '<uid>') u),
  'memberships', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.trip_members m where m.user_id = '<uid>'),
  'trips',     (select coalesce(jsonb_agg(to_jsonb(t) - 'invite_code'), '[]') from public.trips t where t.id in (select trip_id from public.trip_members where user_id = '<uid>')),
  'expenses_paid', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.expenses e where e.paid_by = '<uid>'),
  'feedback',  (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.feedback f where f.user_id = '<uid>')
);
```

A deleted expense is hidden from the app at once, can be undone by the payer for 15 seconds
(server-enforced), and is hard-erased from 30 seconds, at most about 2 minutes after the delete when
pg_cron is running ([Monitor the expense erase job](monitor-expense-erase.md)). The export query above runs as the operator by `paid_by`, so a row
still inside that short window is exported like any other row.

Send the JSON to the verified address. (Expense participant splits live on other members' rows;
include only the requester's own.)

Notes: `trips.types` (the catalog trip types picked: camping, airbnb, international) and
`trips.other_type` (the short trip type an organizer typed under "Other", migration 0022) are
covered by the `trips` row export above. The export uses `to_jsonb(t) - 'invite_code'`, so both
columns are included automatically; a future column exclusion must not drop `other_type`.
`types` is a fixed list of codes and is not personal data. `other_type` is user-typed free text
(max 30 characters), so it may, by the user's choice, contain personal information and is **not**
presumed non-personal. Any trip member can read it through the API (it is not shown in the app
beyond New trip), so do not describe it to a requester as visible only to the organizer. A
non-organizer member who typed nothing has nothing to export for this column.

**Operator read of `other_type` (aggregate only).** The only sanctioned way to read the typed trip
types is this aggregate query, used to decide which trip types to add to the suggestions (the
purpose stated on /privacy). Never join it to `created_by`, `trip_members`, `auth.users` or any
other identity data, and do not read individual rows except to answer an export or erasure request
from the person concerned:

```sql
select other_type, count(*) from public.trips where other_type is not null group by 1 order by 2 desc;
```

`memberships` carries the account's display name on every trip (one name per account since
migration 0020). `feedback` rows hold free-text comments linked to the account, not to a trip
(`trip_id` is null for feedback sent from `/feedback`), so they cannot be found by trip.

## Related

- [Delete an account](delete-an-account.md)
- [Runbooks](README.md)
- [Data model](../reference/data-model.md)

Last verified: 2026-10-20 against 9a951bb
