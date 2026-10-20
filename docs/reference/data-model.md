# Data model

Tables, constraints, RLS policies, functions and triggers. The authoritative schema is `supabase/migrations/NNNN_*.sql` (sequential, never edited after merge). This page summarizes it for lookup. For how the pieces fit, read [Auth](../architecture/auth.md) and [Mutations](../architecture/mutations.md).

## Tables

### `trips`

One row per trip.

| Column | Type | Rule |
|---|---|---|
| `invite_code` | text, unique | How joining works |
| `created_by` | uuid | The organizer. Cascades on user delete. |
| `completed_at` | timestamptz, null | Set means the trip is locked ([Locking](../architecture/mutations.md#locking)) |
| `types` | `text[]`, default `'{}'` | Catalog types in pick order. Closed set `camping`, `airbnb`, `international`; at most 3; no duplicates. Check `trips_types_check`. |
| `other_type` | text, null | A typed trip type, 1 to 30 characters. Check `trips_other_type_check`. |

- "Other" exists only as `other_type` being non-null. There is no `other` code in `types`.
- The `other_type` check is a locale-independent code-point allowlist: BMP only, no emoji, control, invisible or markup characters.
- Checks are column constraints, not only RPC validation, because the direct `INSERT` policy reaches every session.
- Neither column can be updated. There is no update policy and table-level `UPDATE` is revoked from `anon` and `authenticated`. Completion goes through `complete_trip`.
- **`other_type` is free text and potentially personal data.** Any trip member can read it through the API (RLS is row-level), so no public RPC and no `select("*")` may return it. The app never selects it.
- Indexes: primary key, unique `invite_code`. There is no index on `created_by`.

### `trip_members`

Join table: `trip_id`, `user_id`, `display_name`, `is_placeholder`.

| Rule | Detail |
|---|---|
| No direct `INSERT` | Rows come only from `create_trip`, `join_trip`, `join_trip_by_id` and `add_placeholder_member` (all `security definer`) |
| `user_id` is nullable | A check ties `is_placeholder` to `user_id is null`. A placeholder is a name-only member with no auth account. |
| `unique (trip_id, user_id)` | Allows many placeholders per trip, because Postgres treats every `NULL` as distinct |
| Removal is a hard delete | `remove_trip_member` (organizer removes another real member), `leave_trip` (self), `remove_placeholder_member`. All require `is_trip_open`, and none can target the organizer's row. |
| Display name | A `before insert` trigger, `trip_members_apply_canonical_name`, overwrites the name on every non-placeholder row with the account's canonical name. A blank name with no canonical name is stored as `'Organizer'`, the "not chosen yet" sentinel. The trigger is insert-only, so admin updates are not overridden. |
| Delete trigger | `release_shopping_list_claims_on_member_removal` (`before delete`) |
| Indexes | Primary key, `unique (trip_id, user_id)`, `(trip_id)`, `(user_id)` |

**Identity key.** `user_id` can be null on a row (placeholders), and a removed member leaves no row. `src/lib/data/trips.ts` identifies a member by `trip_members.id` in everything it returns (`members[].id`, `you.id`, `expense.payer.id`). `user_id` remains on the raw row only for matching `expenses.paid_by`. See [ADR 0004](../adr/0004-placeholder-member-nullable-user-id-and-identity-key.md).

### `expenses`

One row per logged expense.

| Column | Type | Rule |
|---|---|---|
| `paid_by` | uuid, FK `auth.users` | Set once at insert. The only ownership signal; there is no `created_by`. Always a real user, so a placeholder can never be a payer. |
| `amount` | `numeric(10,2)` | Dollars. Converted to and from integer cents in `src/lib/currency.ts`. |
| `description` | text | |
| `date` | date, not null | The day the expense happened. Default `current_date`; check `date <= current_date`. Distinct from `created_at`. |
| `deleted_at` | timestamptz, null | Soft-delete mark set by `delete_expense` from the database clock ([Deleting an expense](../architecture/mutations.md#deleting-an-expense)) |

- **Splits are not stored.** Every screen computes a member's share as an equal split across the current `trip_members` count (`src/lib/settlement.ts`). Changing an amount needs no reconciliation. A placeholder counts without any settlement change. The denominator changes when a member joins or is removed, by design.
- Indexes: `trip_id`, and `(trip_id, date desc)`. No index leads with `paid_by`; payer resolution happens in application code against an already-fetched, trip-scoped row set (`userIdToMemberId` in `src/lib/data/trips.ts`).

### `shopping_list_items`

One row per per-trip list item.

| Column | Rule |
|---|---|
| `trip_id` | |
| `description` | Free text |
| `added_by`, `claimed_by` | Nullable `trip_members.id`, so member removal can clear them without a foreign-key violation |
| `status` | `open`, `claimed` or `logged`. `text` plus a check constraint, matching the schema's enum-via-check style. |
| `expense_id` | Nullable FK to `expenses` with deliberately **no** `on delete` action, so `delete_expense` reconciles the status explicitly |
| `unlinked_from_expense_id` | FK to `expenses`, `on delete set null`. Remembers the link for Undo; cleared by claim, unclaim, Undo and erase. |

- Claim, unclaim and log-into-expense are RPC-only, with no `UPDATE` grant on the table. A single conditional `UPDATE ... WHERE status = 'open'` inside `claim_shopping_list_item` relies on Postgres row locking so exactly one concurrent caller wins.
- Adding and pre-claim deleting an item are plain RLS `insert` and `delete`.
- Suggested items are never stored. They are derived client-side from `trips.types` and a bundled catalog.
- Indexes: `(trip_id, status)` and partial indexes on `claimed_by`, `added_by`, `expense_id`.

### `feedback`

Free-standing, scoped to `user_id = auth.uid()` for read and write. Submitted from `/feedback` with `trip_id` null. `/trip/[id]/feedback` permanently redirects to `/feedback` (`next.config.ts`). `user_id` is `on delete cascade`.

## RLS policies

| Table | Command | Rule |
|---|---|---|
| `trips` | `select` | `id in (select my_trip_ids()) or created_by = (select auth.uid())` |
| `trips` | `insert` | `created_by = auth.uid()` |
| `trips` | `update`, `delete` | No policy |
| `trip_members` | `select` | `is_owner_or_verified_member(trip_id)` |
| `trip_members` | `insert`, `update`, `delete` | No policy; RPCs only |
| `expenses` | `select` | `is_owner_or_verified_member(trip_id)` and `deleted_at is null`. Policy: *owner or verified member can read live expense detail* |
| `expenses` | `insert` | `is_verified_trip_member(trip_id)`, `is_trip_open(trip_id)`, `paid_by = auth.uid()`, `paid_by` is a trip member, `deleted_at is null`. Policy: *verified member can add own expenses* |
| `expenses` | `update` | Only the row's `paid_by`, `is_verified_trip_member`, `is_trip_open`, `deleted_at is null`. Policy: *verified payer can edit their own live expenses*. Table-level `UPDATE` is revoked and re-granted only on `amount`, `description`, `date`, so `paid_by`, `trip_id` and `deleted_at` are immutable through the API. |
| `expenses` | `delete` | No policy. `DELETE` revoked from `anon` and `authenticated`. |
| `shopping_list_items` | `select` | `is_owner_or_verified_member(trip_id)` |
| `shopping_list_items` | `insert` | Plain ownership policy |
| `shopping_list_items` | `delete` | Pre-claim, adder only |
| `shopping_list_items` | `update` | No policy or grant; RPCs only |
| `feedback` | `select`, `insert` | `user_id = auth.uid()` |

A QA test asserts the `expenses` policy names above are the exact set. See [ADR 0002](../adr/0002-restrict-expense-update-rls-to-payer.md).

## Functions

| Function | Kind | Purpose |
|---|---|---|
| `is_trip_member(trip_id)` | `security definer` SQL | Membership. The building block for most policies. |
| `is_trip_open(trip_id)` | `security definer` SQL | False once `completed_at` is set |
| `is_verified_trip_member(trip_id)` | `security definer` SQL | Owner or member, and non-anonymous. Tier 3 gate. |
| `is_owner_or_verified_member(trip_id)` | `security definer` SQL | Adds back the pre-verification owner. Tier 2 gate; never used by a write policy. |
| `my_trip_ids()` | `security definer` | The caller's trip ids, evaluated once so the planner can hash them |
| `canonical_display_name(user)` | Internal helper | The account's most recently joined real name |
| `create_trip` | RPC | Five-argument and seven-argument (types, other type) overloads |
| `join_trip`, `join_trip_by_id` | RPC | Join a trip. `join_trip` and `get_trip_by_invite_code` throttle themselves in Postgres. |
| `get_trip_by_invite_code` | RPC | Invite preview lookup |
| `get_trip_summary` | RPC, public | Tier 1 aggregates. Bypasses RLS, so it filters `deleted_at` itself. |
| `complete_trip` | RPC | Organizer-only, one-way lock. Requires a non-anonymous caller. |
| `add_placeholder_member`, `rename_placeholder_member`, `remove_placeholder_member` | RPC | Organizer-only, `is_trip_open`-gated, placeholder-only |
| `remove_trip_member`, `leave_trip` | RPC | Hard-delete a real member |
| `was_removed_from_trip` | RPC | Detects removal on a later visit |
| `claim_shopping_list_item`, `unclaim_shopping_list_item` | RPC | List state transitions |
| `add_expense_and_log_shopping_items` | RPC | Atomically inserts an expense and links selected items. Repeats the validation of the plain insert on purpose. |
| `delete_expense`, `undo_delete_expense` | RPC | Soft-mark and restore ([Mutations](../architecture/mutations.md#deleting-an-expense)) |
| `erase_expired_expenses` | Function | Hard-erases rows marked more than 30 s ago |
| `purge_abandoned_anonymous_users(days)` | Function | Daily `pg_cron` retention ([runbook](../runbooks/anonymous-account-retention.md)) |
| `get_my_display_name`, `set_my_display_name(name)` | RPC | Read the account name (null means prompt); set it on all of the caller's non-placeholder rows, 1 to 50 characters, verified accounts only |

## Triggers

| Trigger | Table | Effect |
|---|---|---|
| `trip_members_apply_canonical_name` | `trip_members`, `before insert` | Sets the canonical display name |
| `release_shopping_list_claims_on_member_removal` | `trip_members`, `before delete` | Releases the removed member's in-flight claim to `open` and clears their `added_by` and `claimed_by`. See [ADR 0013](../adr/0013-shopping-list-claim-release-trigger-on-member-removal.md). |

## Scheduled jobs (`pg_cron`, optional)

| Job | Schedule | Function |
|---|---|---|
| `purge-abandoned-anonymous-users` | Daily at 03:17 | `purge_abandoned_anonymous_users(90)` |
| `erase-expired-expenses` | Every minute | `erase_expired_expenses()` |

`pg_cron` is optional in this repo. The scheduling migrations only schedule `if exists` the extension and otherwise print a notice.

## Related

- [Auth](../architecture/auth.md)
- [Mutations](../architecture/mutations.md)
- [Apply a schema change](../guides/apply-a-schema-change.md)
- [ADR index](../adr/README.md)

Last verified: 2026-10-20 against 9a951bb
