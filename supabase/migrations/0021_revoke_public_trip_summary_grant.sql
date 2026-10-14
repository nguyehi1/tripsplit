-- Follow-up to migration 0017 (docs/ROADMAP.md, invite-code-rpc-hardening: "Still open"):
-- get_trip_summary was the last zero-auth, unthrottled RPC callable straight against Supabase's
-- PostgREST endpoint with the public anon key, outside this app's Vercel-fronted routes.
-- Trip ids are gen_random_uuid() (122 bits), so this was never a brute-force surface; the point
-- is to stop direct-to-Supabase callers from hammering it and to keep every read of the public
-- summary tier behind this app's own server code, same as get_trip_by_invite_code after 0017.
--
-- The only two callers are server-side and now use the service-role client
-- (src/lib/supabase/service.ts): renderTripDashboard in src/app/trip/[id]/page.tsx and
-- src/app/api/trip-invite/[code]/route.ts. Who can see the summary is unchanged: anyone holding
-- the trip's UUID, through the app. Function body and return shape are untouched.

revoke execute on function public.get_trip_summary(uuid) from anon, authenticated;
