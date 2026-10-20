# Mutations

Almost every write goes straight from a client component to Supabase, authorized by RLS or by a `security definer` RPC. This page covers when to use which write path, the narrow exceptions, and how locking and expense deletion work.

## The default: direct client writes

Client components call the Supabase browser client (`src/lib/supabase/client.ts`) with a table `.insert()` / `.update()` / `.delete()` or an RPC. RLS is the authorization boundary, so there is deliberately no Next.js route handler in this path.

`src/app/api/` is reserved for work that needs a server-held secret or a server-only computation:

| Route | Why it is a route |
|---|---|
| `POST /api/trip-email` | Needs the Resend API key |
| `GET /api/trip-invite/[code]` | Server-side chokepoint so the invite lookup can be rate limited. Also returns the trip's public summary. |
| `POST /api/join` | Same: rate-limited join |
| `POST /api/perf-log` | Beacon for [client timing](telemetry.md#performance-timing) |

New CRUD mutations default to the direct-client pattern. Add an API route only for a genuine server-secret or server-only reason.

## Choosing a write path

| Situation | Use | Example |
|---|---|---|
| One row, one ownership rule | Plain RLS `insert` / `update` / `delete` policy | Add or delete a shopping-list item |
| The client must not be able to create the row itself | `security definer` RPC, no `INSERT` grant | `trip_members` via `create_trip`, `join_trip` |
| A state transition that depends on the old row | `security definer` RPC, no `UPDATE` grant | Claim, unclaim, log a shopping-list item |
| Several writes that must be atomic | `security definer` RPC | `add_expense_and_log_shopping_items` |
| Reaction to a row change that RLS cannot express | A trigger (use sparingly) | Release a claim when a member is removed |

An RLS `for update` policy cannot compare the old row to the new one, and several permissive policies on the same command are OR-ed together. That is why state transitions use RPCs, not a set of narrower policies. See [ADR 0013](../adr/0013-shopping-list-claim-release-trigger-on-member-removal.md).

### Rules for any new write path

- **Validate in the database.** The direct `INSERT` policy on `trips` is reachable by every session, anonymous included, so constraints belong in column `CHECK`s, not only in an RPC. See [ADR 0014](../adr/0014-trip-types-column-checks-and-create-trip-overload.md).
- **Compose existing predicates.** Build policies from `is_trip_member`, `is_trip_open`, `is_verified_trip_member` and `is_owner_or_verified_member`. Do not re-check `auth.jwt() ->> 'is_anonymous'` inline. See [Auth](auth.md#access-tiers).
- **Never surface raw database errors.** Rethrow a code-only error so a `CHECK` failure's row dump (names, locations, free text) cannot reach UI, logs or analytics.
- **Keep the old and new function signatures working during rollout.** `createTrip` calls the seven-argument `create_trip` overload and falls back to the five-argument one only on `PGRST202` or `42883` (function not found), never on a check violation.
- **Throttle guessable credentials.** An endpoint that accepts an invite-code-like credential from an unauthenticated caller calls `enforceRateLimit`. An RPC with the same shape also throttles itself inside Postgres ([ADR 0009](../adr/0009-throttle-invite-rpcs-inside-postgres.md)). Do not race the limiter against the call it gates to save latency.

Trip creation (the direct `INSERT` on `trips` and both `create_trip` overloads) is knowingly unthrottled. The `CHECK`s bound row size only.

## Locking

A trip is locked when `trips.completed_at` is set. Only the organizer can set it, through `complete_trip`, and it cannot be undone: no reopen RPC exists.

`is_trip_open(trip_id)` returns false once locked. These write paths require it:

| Area | Paths |
|---|---|
| Expenses | `insert` and `update` policies, `delete_expense`, `undo_delete_expense` |
| Placeholder members | `add_placeholder_member`, `rename_placeholder_member`, `remove_placeholder_member` |
| Real members | `remove_trip_member`, `leave_trip` |
| Shopping list | `claim_shopping_list_item`, `unclaim_shopping_list_item`, `add_expense_and_log_shopping_items`, add and delete item policies |

`join_trip` is **not** gated: a real member can still join a completed trip. The UI mirrors the lock with a locked-state screen (`src/lib/locked-trip-copy.ts`).

## Deleting an expense

Delete is a database-clocked soft mark followed by a server-side hard erase.

| Step | Mechanism | Window |
|---|---|---|
| Delete | `delete_expense` sets `expenses.deleted_at`, reverts linked shopping-list items, and remembers the link in `shopping_list_items.unlinked_from_expense_id`. RLS hides the row at once. | Immediate |
| Undo | `undo_delete_expense` clears the mark and re-links items still in the state delete left them | Accepted for 15 s (the toast shows 10 s) |
| Erase | `erase_expired_expenses` hard-deletes rows marked more than 30 s ago | `pg_cron` every minute, plus a bounded batch inside each delete and Undo |

Only the payer can delete, only on an open trip. Clients have no `DELETE` privilege on `expenses`.

Rules for code that reads `expenses`:

- Hiding is done by RLS (`deleted_at is null`), so ordinary reads need no change.
- A reader that bypasses RLS, such as a `security definer` function, **must** filter `deleted_at` itself.
- `src/lib/data/expenses-read-guard.test.ts` pins every reader of `expenses`.

`deleteExpense` and `undoDeleteExpense` live in `src/lib/data/trips.ts` and throw `ExpenseActionError` (`src/lib/errors.ts`). The Undo toast state lives in `src/app/trip/[id]/expense-undo-provider.tsx`. See [ADR 0017](../adr/0017-expense-delete-soft-mark-then-erase.md) and the [erase job runbook](../runbooks/monitor-expense-erase.md).

## Why

RLS keeps authorization beside the data, and RPCs are the narrow exceptions where a policy cannot express the rule. Soft-then-erase makes Undo and the erase independent of the browser and of any one optional extension.

## Related

- [Auth](auth.md)
- [Data model](../reference/data-model.md)
- [Apply a schema change](../guides/apply-a-schema-change.md)
- [ADR 0002](../adr/0002-restrict-expense-update-rls-to-payer.md), [ADR 0013](../adr/0013-shopping-list-claim-release-trigger-on-member-removal.md), [ADR 0017](../adr/0017-expense-delete-soft-mark-then-erase.md)

Last verified: 2026-10-20 against 9a951bb
