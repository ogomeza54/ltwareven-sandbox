# Invoice recognition deployment on Replit

This guide covers the production configuration required by the invoice
recognition module. Secrets must be configured in Replit and must never be
committed to Git.

## 1. Add production secrets

In the Replit workspace, open **Tools > Secrets**, choose **New Secret**, and
add the following values. Replit exposes them to the application as environment
variables.

| Secret | Required value |
| --- | --- |
| `OPENAI_API_KEY` | A project-scoped OpenAI API key owned by the client |
| `INVOICE_OPENAI_MODEL` | `gpt-5.6-luna` |
| `INVOICE_EXTRACTION_PROVIDER` | `openai` |
| `INVOICE_OPENAI_EXECUTION_MODE` | `synchronous` |
| `INVOICE_OPENAI_STORE_RESPONSE` | `true` |
| `INVOICE_OPENAI_REASONING_EFFORT` | `none` |
| `INVOICE_OPENAI_PRIVACY_PROFILE` | `standard` |
| `INVOICE_STORAGE_BACKEND` | `replit` |
| `REPLIT_OBJECT_STORAGE_BUCKET` | The private App Storage bucket identifier |
| `INVOICE_ALLOWED_ORIGIN` | The exact public HTTPS origin of the Replit deployment |

Do not prefix any of these names with `VITE_`: they are server-only values.
Keep `DATABASE_URL` under Replit's database management and do not add
`REMOTE_DATABASE_URL` to the production deployment.

After changing Secrets, restart or redeploy the application so the server reads
the new environment.

## 2. Synchronous pilot behavior

The pilot intentionally uses the same synchronous OpenAI execution mode that
was validated locally. Upload requests still create durable PostgreSQL jobs;
the invoice worker calls OpenAI and the browser polls HaulMaster Pro for the
result. A browser disconnect therefore does not cancel the saved draft.

No OpenAI webhook or `OPENAI_WEBHOOK_SECRET` is required in synchronous mode.

Background execution remains an optional future optimization. If it is enabled,
set `INVOICE_OPENAI_EXECUTION_MODE=background`, create an OpenAI webhook for
`response.completed` and `response.failed`, and add its signing secret as
`OPENAI_WEBHOOK_SECRET`. The endpoint is:

`https://YOUR-REPLIT-DOMAIN/api/invoice-extraction/webhooks/openai`

The server verifies webhook signatures before accepting provider events. Never
put a signing secret in source code, logs, screenshots or the pull request.

## 3. Provision private invoice storage

Create a private Replit App Storage bucket and set its identifier in
`REPLIT_OBJECT_STORAGE_BUCKET`. Invoice originals are authorized through the
application and are not written to the public `uploads/` directory. Production
has no fallback to instance-local disk.

See [invoice-private-storage.md](./invoice-private-storage.md) for the retention
and reconciliation design.

## 4. Apply the database migration

Before any schema change:

1. Take a restorable backup of the production PostgreSQL database.
2. Confirm that the deployment's `DATABASE_URL` points to the intended database.
3. Run `npm run db:migrate:check`.
4. Run the guarded migration once from the Replit Shell:

   ```sh
   INVOICE_MIGRATION_APPROVED=true npm run db:migrate
   ```

Do not save `INVOICE_MIGRATION_APPROVED=true` as a permanent Secret. The command
is idempotent and uses a migration journal plus an advisory lock. Do not use
`npm run db:push` for production delivery.

The full schema delta and verification queries are documented in
[invoice-recognition-migration.md](./invoice-recognition-migration.md).

## 5. Controlled rollout

The migrations do not enable invoice scanning automatically. After deployment:

1. Verify login, manual inventory receipt and existing inventory screens.
2. Register and activate the reviewed `invoice-v1` engine through the governed
   engine-evaluation workflow.
3. Enable `scan_extraction` for the pilot company.
4. Keep `stock_confirmation` disabled until an authorized smoke test succeeds,
   then enable it for the pilot company.
5. Confirm that other companies cannot access the pilot company's documents or
   drafts.

Feature flags provide the operational rollback: disable `scan_extraction` and
`stock_confirmation` without reverting confirmed inventory receipts.

## References

- OpenAI recommends keeping API keys out of code and loading them from a secure
  environment or secret manager:
  https://developers.openai.com/api/docs/guides/production-best-practices#api-keys
- Optional OpenAI background webhook setup and signature verification:
  https://developers.openai.com/api/docs/guides/webhooks
- Replit Secrets:
  https://docs.replit.com/core-concepts/project-editor/app-setup/secrets
