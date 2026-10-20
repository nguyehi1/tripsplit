# Add an analytics event

Add a name-only custom event for a new user action, test that it fires, and document it. Allow about 15 minutes. You need the feature code already working.

## Decide whether to add an event

Add an event when the action is discrete and user-initiated and it marks a conversion point: entry, success or failure of a flow.

Do not add an event for keystrokes, mouse movement, idle time or other ambient activity, or for anything that could carry PII, even anonymized. Use Web Vitals for performance.

## Steps

1. **Name the event.** Use `snake_case`, start with the area (`trip_`, `expense_`, `member_`), and describe the action: `expense_delete_complete`, not `event_5`. The name encodes a user choice only when it comes from a closed, code-defined set. Never put user-typed text, its length or its presence in a name.

2. **Fire it from a client component.** Import `trackEvent`, never `track` directly. It guards against missing analytics and never throws.

   ```tsx
   "use client";

   import { useEffect } from "react";
   import { trackEvent } from "@/lib/tracking";

   export function NewTripForm() {
     // Start events fire on mount.
     useEffect(() => {
       trackEvent("trip_create_start");
     }, []);

     async function handleSubmit() {
       try {
         await createTrip(/* ... */);
         trackEvent("trip_create_complete"); // Complete events fire after success only.
       } catch (e) {
         setError(errorMessage(e)); // Never track on an error.
       }
     }
     // ...
   }
   ```

3. **Keep payloads empty.** `trackEvent` accepts the name only. Do not send a user id, email, trip id, amount or any other property.

4. **Fire only on the right path.** Not on a validation failure, not on a network error, and not from a Server Component. If a page is a Server Component, put the event in a small client leaf.

5. **Add a test.** Mock the wrapper and assert the call:

   ```tsx
   vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

   it("fires trip_create_complete after creating a trip", async () => {
     render(<NewTripForm />);
     fireEvent.click(screen.getByText("Create trip"));
     await waitFor(() => {
       expect(trackEvent).toHaveBeenCalledWith("trip_create_complete");
     });
   });
   ```

6. **Document the event.** Add a row to the right table in the [analytics events reference](../reference/analytics-events.md). If the event derives from the starter catalog, a test fails until the catalog and the reference both have the row.

7. **Check the request locally.** Open DevTools, then Network, and filter by `analytics`. Perform the action and confirm a request carries the event name and no email, name, id or amount. Events may batch and send a few seconds later.

8. **Verify after deploy.** Deploy a preview, perform the action, and confirm the event appears in the Vercel dashboard within a minute or two. See [View analytics in Vercel](view-analytics-in-vercel.md).

## Checklist

- [ ] Name is `snake_case` and follows the area prefix
- [ ] Fires at the right moment (start on mount, complete after success)
- [ ] Does not fire on validation or network errors
- [ ] No PII and no properties
- [ ] Test mocks `@/lib/tracking`
- [ ] Row added to the reference
- [ ] Verified in DevTools, then in the dashboard

## Troubleshooting

| Symptom | Fix |
|---|---|
| Event does not appear in the dashboard | Wait 1 to 2 minutes. Confirm the request is sent and not blocked by an ad blocker. Check the name matches exactly (case-sensitive). Check retention in Vercel project settings. |
| PII was sent | Remove it from the call and redeploy. Review whether the privacy policy needs an update ([Analytics privacy](../product/analytics-privacy.md)). |
| Too much noise | Filter by route in the dashboard. Reconsider whether the event drives a decision. |

## Related

- [Analytics events reference](../reference/analytics-events.md)
- [Telemetry](../architecture/telemetry.md)
- [Analytics privacy](../product/analytics-privacy.md)

Last verified: 2026-10-20 against 9a951bb
