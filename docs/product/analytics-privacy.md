# Analytics privacy

What analytics data Splitiful collects, who can see it, how long it is kept, and what users can do about it. The privacy policy at `/privacy` must stay consistent with this page.

## Data handling

| Question | Answer |
|---|---|
| What is collected | Event name, UTC timestamp, route, and a Vercel-assigned session id (not a user id) |
| What is never collected | Email, name, trip or expense ids, amounts, trip type text, item names, number of types picked |
| Where it is stored | Vercel's infrastructure, included with the Vercel deployment |
| Who can see it | The Splitiful team, as aggregated metrics, with Vercel project access |
| Shared with third parties | No. Vercel Analytics is first-party only. |
| Retention | 30 days or more in the Vercel dashboard (configurable in project settings). Older events are deleted automatically. There are no backups or archives beyond the window. |

The full event list is in the [analytics events reference](../reference/analytics-events.md).

## User choice

Users cannot opt out in the app, because there is no in-app toggle. They can:

- Block analytics in the browser, with privacy extensions or browser settings.

The team can disable collection by removing `<Analytics />` from `src/app/layout.tsx` or by turning it off in Vercel project settings.

If a privacy regulation later requires explicit consent, a cookie banner or analytics consent flow would be added as a separate feature.

## Policy wording

The privacy policy should state:

> We use Vercel Analytics to understand how the app is used and to improve performance. Vercel Analytics collects anonymized event data (for example, when you create a trip or add an expense) but does not collect personally identifiable information such as your email or expense amounts. Data is retained for 30+ days and is not shared with third parties.

## If PII is sent by mistake

1. Remove the data from the event call and redeploy.
2. Note that events older than the retention window delete themselves.
3. Decide whether the privacy policy needs an update.

## Related

- [Compliance baseline](../reviews/security-compliance/project/compliance-baseline.md)
- [Telemetry](../architecture/telemetry.md)
- [Analytics events reference](../reference/analytics-events.md)

Last verified: 2026-10-20 against 9a951bb
