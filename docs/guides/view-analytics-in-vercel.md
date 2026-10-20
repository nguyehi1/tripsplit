# View analytics in Vercel

Read web vitals and custom event counts in the Vercel dashboard, and turn two events into a conversion rate. You need access to the Vercel project.

## View web vitals

1. Open [vercel.com/dashboard](https://vercel.com/dashboard) and select the Splitiful project.
2. Open the **Analytics** tab. The default view shows Core Web Vitals: LCP, INP and CLS.
3. Click a route (for example `/trip/[id]`) to see how that page performs.
4. Use the date picker at the top right to change the time range.

## View custom events

1. In the Analytics tab, open the **Events** section below Web Vitals.
2. Click an event name (for example `expense_add_complete`) to see:
   - **Count:** how many times it fired
   - **Chart:** count over time
   - **Routes:** which pages fired it
3. Compare date ranges to see week-over-week change, or filter by route to focus on one page.

## Calculate a conversion rate

Divide the count of the completing event by the count of the starting event over the same time range.

| Question | Calculation |
|---|---|
| Trip creation conversion | `trip_create_complete` ÷ `trip_create_start` |
| Join conversion | `trip_join_complete` ÷ `trip_join_start` |
| Invite clicks that never joined | `trip_join_start` − `trip_join_complete` |
| Share of expenses later edited | `expense_edit_complete` ÷ `expense_add_complete` |
| Sign-in growth | `sign_in_complete`, two date ranges compared |
| Trips created this week | `trip_create_complete`, this week's range |
| Slowest page by LCP | Web Vitals, compare median and p75 across routes |

Event names and what each one means are in the [analytics events reference](../reference/analytics-events.md).

## Related

- [Analytics events reference](../reference/analytics-events.md)
- [Add an analytics event](add-an-analytics-event.md)
- [Vercel Analytics documentation](https://vercel.com/docs/analytics)

Last verified: 2026-10-20 against 9a951bb
