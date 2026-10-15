# Release checklist: starter-list-exploration (v0.8.0)

Manual steps for the owner, in order. Do not skip ahead: the app reads `trips.types`, so the
database must be ready first. Migration 0022 is this feature's; 0021
(`0021_revoke_public_trip_summary_grant`) is upstream and already applied.

1. **Apply the FIXED migration 0022** (`supabase/migrations/0022_trip_types_and_other_type.sql`) to
   the database, a non-production project first if you have one. The file was corrected before
   release (the `trips_types_check` constraint), so make sure you apply the current file, not an
   earlier copy. Then check the live constraint:

   ```sql
   select pg_get_constraintdef(oid) from pg_constraint where conname = 'trips_types_check';
   ```

   The definition should match the constraint in the 0022 file. If it differs, drop and re-add it
   from the current file before going on.
2. **Run the live suite:** `supabase/migrations/0022_trip_types_and_other_type.live.qa.test.ts`
   with the `LIVE_SUPABASE_*` variables pointing at the same database.
3. **Run the verify SQL:** `supabase/verify/0022_trip_types_and_other_type.verify.sql` (see
   `docs/runbooks/account-deletion-and-export.md` section 5).
4. **Test creating trips** (against the migrated database): create one with 1 type, one with 2, one
   with 3, and one with "Other" plus a short typed text. Confirm each saves and the List tab shows
   the Suggested card (Other alone gives no suggestions).
5. **Deploy the app** (merge, then deploy). Never before step 1.
6. **Counsel review** of the draft copy: `/privacy` (trip types, typed trip type, the
   legitimate-interest purpose, `LEGAL_LAST_UPDATED` October 13, 2026) and the updated runbook
   wording.
7. **Product owner, X1:** decide on the welcome-page claims "0 accounts to join" and "no account
   needed to start".

Version bump to 0.8.0 in `package.json` is confirmed at the pipeline's final checkpoint, not here.
