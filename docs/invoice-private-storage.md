# Invoice private source storage

Invoice source documents are never written to or served from the Brownfield
`uploads/` directory. PostgreSQL owns tenant authorization and lifecycle; an
opaque server-generated object key is an implementation detail and is never a
public access credential.

## Production provisioning

1. Provision a private Replit App Storage bucket for invoice sources.
2. Set `INVOICE_STORAGE_BACKEND=replit`.
3. Set `REPLIT_OBJECT_STORAGE_BUCKET` to the provisioned bucket identifier.
4. Set `INVOICE_ALLOWED_ORIGIN` to the exact HTTPS application origin.

Application startup fails in production if the backend is not `replit` or the
bucket is absent. There is no production fallback to instance disk.

## Local and test configuration

Set `INVOICE_STORAGE_BACKEND=filesystem` and `INVOICE_STORAGE_ROOT` to a private
directory outside `uploads/`. Writes are copied to a temporary sibling, synced,
then atomically renamed. Object keys are resolved beneath the configured root
and traversal is rejected. This adapter is intended only for development and
deterministic tests.

The ordinary test suite uses the local adapter and mocks provider boundaries.
An App Storage contract smoke test must be separately opt-in, use an authorized
non-production bucket and synthetic content, and must never run as part of
`npm test`.

## Retention and reconciliation

Source-document retention defaults to 365 days, while the containing draft's
abandonment deadline is refreshed to the configurable 30-day window. Staging
and verified rows retain the opaque intended object key so
interrupted DB/object operations remain discoverable. The service can reconcile
tenant-scoped orphan and failed-delete candidates idempotently; scheduling that
operation is deliberately outside Story 2.1.
