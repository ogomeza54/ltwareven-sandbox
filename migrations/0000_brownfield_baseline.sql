-- Controlled Brownfield adoption marker.
-- The guarded migration runner verifies only the Brownfield objects required by
-- invoice receiving before Drizzle records this no-op migration. Optional
-- accounting integration tables such as company_integrations are deliberately
-- outside this baseline and are never created or modified here.
select 1;
