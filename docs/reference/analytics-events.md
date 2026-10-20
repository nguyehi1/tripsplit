# Analytics events

Every custom analytics event Splitiful sends, with its trigger and where it fires. Events are name-only: Vercel Analytics adds the timestamp, route and a session id, and the app sends no properties and no personally identifiable information (PII). For how tracking works, read [Telemetry](../architecture/telemetry.md). To add an event, follow [Add an analytics event](../guides/add-an-analytics-event.md).

## Event catalog

### Trip Management

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `trip_create_start` | User navigates to or clicks "Create a new trip" | `/trip/new` page load | Measure top-of-funnel traffic to trip creation | `{ event: "trip_create_start" }` |
| `trip_create_complete` | Trip successfully created in database | `src/app/trip/new/page.tsx` after `createTrip()` returns | Measure conversion rate; identify drop-off in creation flow | `{ event: "trip_create_complete" }` |
| `trip_join_start` | User lands on invite link or enters join code | `/join/[code]` page load | Measure invite link click-through rate | `{ event: "trip_join_start" }` |
| `trip_join_complete` | User successfully added to trip members after auth | `src/app/join/[code]/page.tsx` after `joinTrip()` returns | Measure join-flow conversion; identify auth/membership drop-off | `{ event: "trip_join_complete" }` |

### Starter Lists

Name-only, like every other event: no properties, and never the trip type text, a trip id or an item name. The `trip_type_selected_*` events fire once per stored type right after `trip_create_complete`, and only if the types were really stored.

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `trip_type_selected_camping` | Trip created with Camping picked | `src/app/trip/new/page.tsx` after `createTrip()` returns | Measure how often each trip type is picked | `{ event: "trip_type_selected_camping" }` |
| `trip_type_selected_airbnb` | Trip created with Airbnb stay picked | `src/app/trip/new/page.tsx` after `createTrip()` returns | Measure how often each trip type is picked | `{ event: "trip_type_selected_airbnb" }` |
| `trip_type_selected_international` | Trip created with International picked | `src/app/trip/new/page.tsx` after `createTrip()` returns | Measure how often each trip type is picked | `{ event: "trip_type_selected_international" }` |
| `trip_type_selected_other` | Trip created with Other picked and a trip type saved | `src/app/trip/new/page.tsx` after `createTrip()` returns | Measure how often people need a type we do not offer; carries no text, length or other property | `{ event: "trip_type_selected_other" }` |
| `suggestion_add_complete` | A Suggested-card "+" add succeeded (including the one completed after email confirmation) | `src/app/trip/[id]/shopping-list-tab.tsx` after `addShoppingListItems()` returns | Measure whether suggestions get used | `{ event: "suggestion_add_complete" }` |

### Home and templates

Fired **on the tap, before navigation, with no account**: the visitor may be signed out and nothing is created, stored or sent to the database. The `home_template_tapped_*` names are a closed set built only from the bundled catalog codes (there is no `home_template_tapped_other`), carry no properties, and are distinct from `trip_type_selected_*`, which means "stored on a created trip". The "New trip" pill on `/trips` and "Create your first trip" on `/` fire nothing.

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `home_template_tapped_camping` | Camping tile tapped on the home shelf | `src/components/template-tile.tsx`, on `/trips` and `/` | See which templates attract taps before a trip exists | `{ event: "home_template_tapped_camping" }` |
| `home_template_tapped_airbnb` | Airbnb stay tile tapped on the home shelf | `src/components/template-tile.tsx`, on `/trips` and `/` | See which templates attract taps before a trip exists | `{ event: "home_template_tapped_airbnb" }` |
| `home_template_tapped_international` | International tile tapped on the home shelf | `src/components/template-tile.tsx`, on `/trips` and `/` | See which templates attract taps before a trip exists | `{ event: "home_template_tapped_international" }` |
| `home_blank_trip_tapped` | "Blank trip" link tapped on the shelf | `src/components/template-tile.tsx` (`BlankTripLink`), on `/trips` and `/` | Compare templated and blank starts | `{ event: "home_blank_trip_tapped" }` |

### Expense Management

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `expense_add_start` | User navigates to or lands on add-expense page | `/trip/[id]/add-expense` page load | Measure frequency of expense logging attempts | `{ event: "expense_add_start" }` |
| `expense_add_complete` | Expense successfully inserted into database | `src/app/trip/[id]/add-expense/page.tsx` after `addExpense()` returns | Measure expense logging success rate; identify form drop-off or validation issues | `{ event: "expense_add_complete" }` |
| `expense_edit_start` | User opens edit form for existing expense | `/trip/[id]/expense/[expenseId]/edit` page load | Measure data-correction behavior; indicates data quality concerns | `{ event: "expense_edit_start" }` |
| `expense_edit_complete` | Edited expense successfully saved to database | `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` after `updateExpense()` returns | Measure edit success rate; identify form drop-off | `{ event: "expense_edit_complete" }` |
| `expense_delete_complete` | Expense successfully deleted (Undo window opens) | `src/app/trip/[id]/edit-expense-sheet-content.tsx` after `deleteExpense()` returns | Measure how often expenses are deleted | `{ event: "expense_delete_complete" }` |
| `expense_undo_complete` | Deleted expense successfully restored with Undo | `src/app/trip/[id]/expense-undo-provider.tsx` after `undoDeleteExpense()` returns | Measure how often a delete is undone | `{ event: "expense_undo_complete" }` |

### Member & Invite Management

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `member_invite_send` | User clicks "Send invite(s)" and email(s) sent successfully | `src/app/trip/[id]/invite/page.tsx` after email send or RPC call | Measure how many people are invited (network effect breadth); engagement with invite feature | `{ event: "member_invite_send" }` |
| `member_email_invite_open` | Organizer taps Invite on "Invite by email" and the mail app is opened with the prefilled message (Splitiful sends nothing) | `src/app/trip/[id]/invite/page.tsx` in `handleInvite`, right before the `mailto:` opens | Measure adoption of the email-invite shortcut vs. copy/share link | `{ event: "member_email_invite_open" }` |
| `member_placeholder_add` | Organizer adds a placeholder member (name-only, no invite) | `src/app/trip/[id]/page.tsx` or invite component after `add_placeholder_member()` RPC returns | Measure adoption of placeholder feature; preference for adding names vs. sending invites | `{ event: "member_placeholder_add" }` |

### Authentication

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `sign_in_start` | User submits email form to request OTP code | `src/app/page.tsx` after valid email form submission; before `signInWithOtp()` returns | Measure authentication flow entry; new user acquisition attempts | `{ event: "sign_in_start" }` |
| `sign_in_complete` | User successfully verifies OTP code and session is established | `src/app/check-email/page.tsx` after successful OTP verification; or root after redirect from auth callback | Measure successful authentication rate; identify friction in OTP verification step | `{ event: "sign_in_complete" }` |

### Settlement

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `settlement_view` | User navigates to settlement/settle-up page | `/trip/[id]/settle-up` page load or settlement section viewed | Measure user engagement with settlement feature; how many people review who owes whom | `{ event: "settlement_view" }` |
| `settlement_complete` | Trip marked as settled/completed or payment marked as resolved | `src/app/trip/[id]/settle-up/page.tsx` or trip details after `complete_trip()` RPC or payment recorded | Measure actual settlement rate; identify trips that are abandoned vs. resolved | `{ event: "settlement_complete" }` |

## What is and is not collected

| Collected | Not collected |
|---|---|
| Event name | Email addresses and user names |
| Timestamp (UTC) | Trip ids and expense ids |
| Page or route | Expense amounts |
| Session id assigned by Vercel (not a user id) | Trip type text (the "Other" label), item names, or the number of types picked |

## Related

- [Telemetry](../architecture/telemetry.md)
- [Add an analytics event](../guides/add-an-analytics-event.md)
- [View analytics in Vercel](../guides/view-analytics-in-vercel.md)
- [Analytics privacy](../product/analytics-privacy.md)
- [Vercel Analytics feature record](../features/vercel-analytics/requirements.md)

Last verified: 2026-10-20 against 9a951bb
