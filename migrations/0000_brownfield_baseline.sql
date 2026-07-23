-- Controlled Brownfield adoption marker.
-- The guarded migration runner verifies the frozen pre-feature schema before
-- Drizzle records this no-op migration. Brownfield objects are never recreated.
select 1;
