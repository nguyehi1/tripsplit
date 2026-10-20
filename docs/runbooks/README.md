# Runbooks

Operator procedures for production. Each page is one procedure with copy-pasteable commands. Run SQL in the Supabase SQL editor as the postgres owner unless the page says otherwise.

| Procedure | Use it when |
|---|---|
| [Export a user's data](export-user-data.md) | A requester asks for a copy of their data |
| [Delete an account](delete-an-account.md) | A requester asks for erasure |
| [Anonymous-account retention](anonymous-account-retention.md) | Setting up or changing the automatic purge |
| [Monitor the expense erase job](monitor-expense-erase.md) | Daily check that deleted expenses are being erased |
| [Release 0022: trip types](releases/0022-trip-types.md) | Releasing migration 0022 |
| [Release 0024: expense delete](releases/0024-expense-delete.md) | Releasing migration 0024 |

## Handle a privacy request

Requests arrive at Splitiful@gmail.com, the address on `/privacy` (`src/lib/legal.ts`). Make sure it is a monitored inbox. It is a regular Gmail account, so no DNS or forwarding setup is needed. Respond within 30 days, the figure promised on `/privacy`.

### Verify the requester

| Account | How to verify |
|---|---|
| Verified (has an email) | The request must come from the email on the account. Otherwise reply to that address asking them to confirm. |
| Anonymous (no email) | Ask for the trip link and display name. Act only if that matches a single anonymous member. If unsure, ask them to confirm from the browser. |

Then [export their data](export-user-data.md) or [delete their account](delete-an-account.md).

Last verified: 2026-10-20 against 9a951bb
