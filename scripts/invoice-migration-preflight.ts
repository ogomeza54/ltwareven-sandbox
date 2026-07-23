import { createHash } from "node:crypto";
import type { Client } from "pg";

const requiredColumns: Readonly<Record<string, readonly string[]>> = {
  companies: ["id", "name", "plan", "created_at", "updated_at"],
  users: ["id", "email", "role", "company_id", "created_at", "updated_at"],
  inventory_parts: ["id", "company_id", "quantity_in_stock", "item_type"],
  inventory_intakes: [
    "id",
    "company_id",
    "created_by_user_id",
    "quickbooks_sync_status",
    "quickbooks_id",
    "qb_transaction_type",
    "qb_debit_account",
    "qb_credit_account",
  ],
  inventory_intake_items: [
    "id",
    "company_id",
    "inventory_intake_id",
    "part_id",
    "quickbooks_sync_status",
    "quickbooks_id",
    "qb_transaction_type",
  ],
};

const requiredColumnShapes: Readonly<
  Record<string, Readonly<Record<string, { type: string; nullable: boolean }>>>
> = {
  companies: {
    id: { type: "character varying", nullable: false },
    name: { type: "text", nullable: false },
  },
  users: {
    id: { type: "character varying", nullable: false },
    company_id: { type: "character varying", nullable: false },
    role: { type: "text", nullable: false },
  },
  inventory_parts: {
    id: { type: "character varying", nullable: false },
    company_id: { type: "character varying", nullable: false },
    quantity_in_stock: { type: "integer", nullable: false },
  },
  inventory_intakes: {
    id: { type: "character varying", nullable: false },
    company_id: { type: "character varying", nullable: false },
    created_by_user_id: { type: "character varying", nullable: true },
  },
  inventory_intake_items: {
    id: { type: "character varying", nullable: false },
    company_id: { type: "character varying", nullable: false },
    inventory_intake_id: { type: "character varying", nullable: false },
  },
};

const requiredLedgerConstraints = [
  "invoice_review_drafts_pkey",
  "invoice_review_drafts_company_id_id_unique",
  "invoice_review_drafts_revision_nonnegative",
  "invoice_review_drafts_company_fk",
  "invoice_review_drafts_creator_fk",
  "invoice_review_drafts_updater_fk",
  "invoice_review_drafts_active_run_fk",
  "invoice_extraction_runs_pkey",
  "invoice_extraction_runs_company_draft_id_unique",
  "invoice_extraction_runs_company_id_unique",
  "invoice_extraction_runs_company_draft_number_unique",
  "invoice_extraction_runs_revision_nonnegative",
  "invoice_extraction_runs_number_positive",
  "invoice_extraction_runs_base_revision_nonnegative",
  "invoice_extraction_runs_company_fk",
  "invoice_extraction_runs_draft_fk",
  "invoice_extraction_runs_requester_fk",
  "invoice_provider_attempts_pkey",
  "invoice_provider_attempts_company_run_ordinal_unique",
  "invoice_provider_attempts_ordinal_positive",
  "invoice_provider_attempts_revision_nonnegative",
  "invoice_provider_attempts_run_fk",
  "invoice_provider_attempts_company_fk",
  "invoice_provider_attempts_lease_coherent",
  "company_invoice_feature_flags_company_id_capability_pk",
  "company_invoice_feature_flags_revision_nonnegative",
  "company_invoice_feature_flags_company_fk",
  "company_invoice_feature_flags_updater_fk",
  "invoice_audit_events_pkey",
  "invoice_audit_events_metadata_object",
  "invoice_audit_events_company_fk",
  "invoice_audit_events_actor_company_fk",
  "invoice_audit_events_actor_fk",
] as const;

const requiredLedgerIndexes = [
  "users_company_id_id_unique",
  "invoice_review_drafts_company_activity_idx",
  "invoice_provider_attempts_response_unique",
  "invoice_provider_attempts_one_completed_per_run",
  "invoice_provider_attempts_claim_idx",
  "invoice_audit_events_company_created_idx",
] as const;

const ledgerConstraintFingerprint =
  "b5ae8428ec6963bd06a0a7e4fc76f2db7343056a95ba7dc2c98f2a0b6c9dc353";
const ledgerIndexFingerprint =
  "39a7b302352f5ef0a28fad441ff105426c93d0e9e5065d7b45e173073095317d";
const auditFunctionFingerprint =
  "8a092ece6c7abeeb70d104abc14fef55e63d6ca787cb72e9c8f9ed2cf871bfc3";

const requiredLedgerColumns: Readonly<Record<string, readonly string[]>> = {
  invoice_review_drafts: [
    "id",
    "company_id",
    "status",
    "revision",
    "active_run_id",
    "created_by_company_id",
    "created_by_user_id",
    "updated_by_company_id",
    "updated_by_user_id",
    "created_at",
    "updated_at",
    "last_activity_at",
    "abandoned_at",
    "retention_deadline",
  ],
  invoice_extraction_runs: [
    "id",
    "company_id",
    "draft_id",
    "run_number",
    "status",
    "revision",
    "base_draft_revision",
    "requested_by_company_id",
    "requested_by_user_id",
    "correlation_id",
    "failure_code",
    "created_at",
    "started_at",
    "completed_at",
  ],
  invoice_provider_attempts: [
    "id",
    "company_id",
    "run_id",
    "ordinal",
    "provider",
    "status",
    "revision",
    "provider_response_id",
    "available_at",
    "lease_owner",
    "lease_token",
    "lease_expires_at",
    "heartbeat_at",
    "failure_code",
    "created_at",
    "completed_at",
  ],
  company_invoice_feature_flags: [
    "company_id",
    "capability",
    "enabled",
    "revision",
    "updated_by_company_id",
    "updated_by_user_id",
    "updated_at",
  ],
  invoice_audit_events: [
    "id",
    "company_id",
    "actor_user_id",
    "actor_company_id",
    "action",
    "target_type",
    "target_id",
    "correlation_id",
    "request_id",
    "metadata",
    "created_at",
  ],
};

const requiredEnumLabels: Readonly<Record<string, readonly string[]>> = {
  invoice_draft_status: [
    "draft",
    "uploaded",
    "needs_review",
    "rejected",
    "confirming",
    "confirmed",
    "canceled",
  ],
  invoice_run_status: [
    "queued",
    "processing",
    "completed",
    "failed",
    "canceled",
  ],
  invoice_attempt_status: [
    "queued",
    "processing",
    "submitted",
    "completed",
    "failed",
    "canceled",
  ],
  invoice_feature_capability: [
    "scan_extraction",
    "stock_confirmation",
    "engine_activation",
  ],
};

const requiredLedgerColumnShapes: Readonly<
  Record<string, { type: string; nullable: boolean }>
> = {
  "invoice_review_drafts.id": { type: "uuid", nullable: false },
  "invoice_review_drafts.company_id": {
    type: "character varying",
    nullable: false,
  },
  "invoice_review_drafts.status": { type: "USER-DEFINED", nullable: false },
  "invoice_review_drafts.revision": { type: "integer", nullable: false },
  "invoice_review_drafts.active_run_id": { type: "uuid", nullable: true },
  "invoice_extraction_runs.id": { type: "uuid", nullable: false },
  "invoice_extraction_runs.company_id": {
    type: "character varying",
    nullable: false,
  },
  "invoice_extraction_runs.draft_id": { type: "uuid", nullable: false },
  "invoice_extraction_runs.status": { type: "USER-DEFINED", nullable: false },
  "invoice_extraction_runs.revision": { type: "integer", nullable: false },
  "invoice_extraction_runs.base_draft_revision": {
    type: "integer",
    nullable: false,
  },
  "invoice_provider_attempts.id": { type: "uuid", nullable: false },
  "invoice_provider_attempts.company_id": {
    type: "character varying",
    nullable: false,
  },
  "invoice_provider_attempts.run_id": { type: "uuid", nullable: false },
  "invoice_provider_attempts.status": {
    type: "USER-DEFINED",
    nullable: false,
  },
  "invoice_provider_attempts.revision": { type: "integer", nullable: false },
  "invoice_provider_attempts.lease_token": { type: "uuid", nullable: true },
  "company_invoice_feature_flags.company_id": {
    type: "character varying",
    nullable: false,
  },
  "company_invoice_feature_flags.capability": {
    type: "USER-DEFINED",
    nullable: false,
  },
  "company_invoice_feature_flags.enabled": {
    type: "boolean",
    nullable: false,
  },
  "invoice_audit_events.id": { type: "uuid", nullable: false },
  "invoice_audit_events.company_id": {
    type: "character varying",
    nullable: false,
  },
  "invoice_audit_events.target_id": { type: "uuid", nullable: false },
  "invoice_audit_events.request_id": { type: "uuid", nullable: true },
  "invoice_audit_events.metadata": { type: "jsonb", nullable: false },
};

const requiredPrivateSourceColumns: Readonly<Record<string, readonly string[]>> =
  {
    invoice_documents: [
      "id",
      "company_id",
      "draft_id",
      "fingerprint_sha256",
      "total_pages",
      "retention_deadline",
      "created_at",
      "updated_at",
    ],
    invoice_source_assets: [
      "id",
      "company_id",
      "draft_id",
      "document_id",
      "lifecycle",
      "object_key",
      "display_name",
      "detected_type",
      "byte_size",
      "sha256",
      "page_count",
      "position",
      "hold_at",
      "delete_attempts",
      "delete_failure_code",
      "delete_requested_at",
      "deleted_at",
      "created_at",
      "updated_at",
    ],
  };

const requiredPrivateSourceConstraints = [
  "invoice_documents_pkey",
  "invoice_documents_company_draft_id_unique",
  "invoice_documents_company_draft_unique",
  "invoice_documents_pages_nonnegative",
  "invoice_documents_fingerprint_shape",
  "invoice_documents_company_fk",
  "invoice_documents_draft_fk",
  "invoice_source_assets_pkey",
  "invoice_source_assets_company_id_id_unique",
  "invoice_source_assets_company_document_id_unique",
  "invoice_source_assets_size_positive",
  "invoice_source_assets_pages_positive",
  "invoice_source_assets_position_positive",
  "invoice_source_assets_delete_attempts_nonnegative",
  "invoice_source_assets_sha_shape",
  "invoice_source_assets_lifecycle_coherent",
  "invoice_source_assets_company_fk",
  "invoice_source_assets_draft_fk",
  "invoice_source_assets_document_fk",
] as const;

const privateConstraintTables: Readonly<Record<string, string>> =
  Object.fromEntries(
    requiredPrivateSourceConstraints.map((name) => [
      name,
      name.startsWith("invoice_documents_")
        ? "invoice_documents"
        : "invoice_source_assets",
    ]),
  );

const requiredPrivateSourceIndexes = [
  "invoice_source_assets_attached_position_unique",
  "invoice_source_assets_document_checksum_unique",
  "invoice_source_assets_reconcile_idx",
] as const;
const privateSourceConstraintFingerprint =
  "1760b56f6ab997253569e2a188a07ba34364965056ab5e6675607b423f821864";
const privateSourceIndexFingerprint =
  "43b3920ce7dbc5b8ea9de8f5893a6705d7a6408454c81b89102b0c64ec4007d1";

const requiredPrivateSourceShapes: Readonly<
  Record<string, { type: string; nullable: boolean }>
> = {
  "invoice_documents.id": { type: "uuid", nullable: false },
  "invoice_documents.company_id": {
    type: "character varying",
    nullable: false,
  },
  "invoice_documents.draft_id": { type: "uuid", nullable: false },
  "invoice_documents.total_pages": { type: "integer", nullable: false },
  "invoice_documents.retention_deadline": {
    type: "timestamp with time zone",
    nullable: false,
  },
  "invoice_source_assets.id": { type: "uuid", nullable: false },
  "invoice_source_assets.company_id": {
    type: "character varying",
    nullable: false,
  },
  "invoice_source_assets.draft_id": { type: "uuid", nullable: false },
  "invoice_source_assets.document_id": { type: "uuid", nullable: false },
  "invoice_source_assets.lifecycle": {
    type: "USER-DEFINED",
    nullable: false,
  },
  "invoice_source_assets.display_name": {
    type: "character varying",
    nullable: false,
  },
  "invoice_source_assets.delete_attempts": {
    type: "integer",
    nullable: false,
  },
};

export async function assertBrownfieldBaseline(client: Client): Promise<void> {
  const result = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
  }>(
    `select table_name, column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])`,
    [Object.keys(requiredColumns)],
  );
  const actual = new Map<string, Set<string>>();
  const actualShapes = new Map<string, { type: string; nullable: boolean }>();
  const incompatible: string[] = [];
  for (const row of result.rows) {
    const columns = actual.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    actual.set(row.table_name, columns);
    actualShapes.set(`${row.table_name}.${row.column_name}`, {
      type: row.data_type,
      nullable: row.is_nullable === "YES",
    });
  }
  for (const [table, columns] of Object.entries(requiredColumnShapes)) {
    for (const [column, expected] of Object.entries(columns)) {
      const observed = actualShapes.get(`${table}.${column}`);
      if (
        observed &&
        (observed.type !== expected.type ||
          observed.nullable !== expected.nullable)
      ) {
        incompatible.push(
          `incompatible column ${table}.${column} (${observed.type}, nullable=${observed.nullable})`,
        );
      }
    }
  }
  const primaryKeys = await client.query<{ table_name: string }>(
    `select table_name
       from information_schema.table_constraints
      where table_schema = 'public'
        and constraint_type = 'PRIMARY KEY'
        and table_name = any($1::text[])`,
    [Object.keys(requiredColumns)],
  );
  const primaryKeyTables = new Set(
    primaryKeys.rows.map((row) => row.table_name),
  );
  for (const table of Object.keys(requiredColumns)) {
    if (!primaryKeyTables.has(table)) {
      incompatible.push(`missing primary key ${table}`);
    }
  }
  for (const [table, columns] of Object.entries(requiredColumns)) {
    if (!actual.has(table)) {
      incompatible.push(`missing table ${table}`);
      continue;
    }
    for (const column of columns) {
      if (!actual.get(table)?.has(column)) {
        incompatible.push(`missing column ${table}.${column}`);
      }
    }
  }
  if (incompatible.length > 0) {
    throw new Error(
      `Brownfield migration preflight failed: ${incompatible.join(", ")}`,
    );
  }

  const premature = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])`,
    [
      [
        "invoice_review_drafts",
        "invoice_extraction_runs",
        "invoice_provider_attempts",
        "company_invoice_feature_flags",
        "invoice_audit_events",
      ],
    ],
  );
  const journal = await client.query<{ exists: boolean }>(
    `select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
  );
  if (premature.rowCount && !journal.rows[0]?.exists) {
    throw new Error(
      "Brownfield migration preflight failed: untracked invoice ledger objects",
    );
  }
  if (journal.rows[0]?.exists) {
    const sourceTables = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])`,
      [["invoice_documents", "invoice_source_assets"]],
    );
    const sourceJournal = await client.query<{ applied: boolean }>(
      `select exists (
         select 1 from drizzle.__drizzle_migrations
          where created_at = 1784764802000
       ) as applied`,
    );
    if (sourceTables.rowCount && !sourceJournal.rows[0]?.applied) {
      throw new Error(
        "Brownfield migration preflight failed: untracked private invoice source objects",
      );
    }
    if (sourceJournal.rows[0]?.applied && sourceTables.rowCount !== 2) {
      throw new Error(
        "Brownfield migration preflight failed: journaled private invoice sources are incomplete",
      );
    }
    const recorded = await client.query<{ applied: boolean }>(
      `select exists (
         select 1 from drizzle.__drizzle_migrations
          where created_at = 1784764801000
       ) as applied`,
    );
    if (recorded.rows[0]?.applied && premature.rowCount !== 5) {
      throw new Error(
        "Brownfield migration preflight failed: journaled invoice ledger is incomplete",
      );
    }
    if (recorded.rows[0]?.applied) {
      const ledgerColumnDrift: string[] = [];
      const ledgerColumns = await client.query<{
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: "YES" | "NO";
      }>(
        `select table_name, column_name, data_type, is_nullable
           from information_schema.columns
          where table_schema = 'public'
            and table_name = any($1::text[])`,
        [Object.keys(requiredLedgerColumns)],
      );
      const observedLedgerColumns = new Map<string, Set<string>>();
      const observedLedgerShapes = new Map<
        string,
        { type: string; nullable: boolean }
      >();
      for (const row of ledgerColumns.rows) {
        const names =
          observedLedgerColumns.get(row.table_name) ?? new Set<string>();
        names.add(row.column_name);
        observedLedgerColumns.set(row.table_name, names);
        observedLedgerShapes.set(`${row.table_name}.${row.column_name}`, {
          type: row.data_type,
          nullable: row.is_nullable === "YES",
        });
      }
      for (const [key, expected] of Object.entries(
        requiredLedgerColumnShapes,
      )) {
        const observed = observedLedgerShapes.get(key);
        if (
          !observed ||
          observed.type !== expected.type ||
          observed.nullable !== expected.nullable
        ) {
          ledgerColumnDrift.push(`incompatible column ${key}`);
        }
      }
      for (const [table, expectedColumns] of Object.entries(
        requiredLedgerColumns,
      )) {
        const observed = observedLedgerColumns.get(table) ?? new Set<string>();
        const expected = new Set(expectedColumns);
        for (const column of expected) {
          if (!observed.has(column)) {
            ledgerColumnDrift.push(`missing column ${table}.${column}`);
          }
        }
        for (const column of observed) {
          if (!expected.has(column)) {
            ledgerColumnDrift.push(`unexpected column ${table}.${column}`);
          }
        }
      }
      const enumRows = await client.query<{
        enum_name: string;
        enum_label: string;
        sort_order: number;
      }>(
        `select type.typname as enum_name,
                value.enumlabel as enum_label,
                value.enumsortorder as sort_order
           from pg_type type
           join pg_enum value on value.enumtypid = type.oid
          where type.typname = any($1::text[])
          order by type.typname, value.enumsortorder`,
        [Object.keys(requiredEnumLabels)],
      );
      const observedEnums = new Map<string, string[]>();
      for (const row of enumRows.rows) {
        const labels = observedEnums.get(row.enum_name) ?? [];
        labels.push(row.enum_label);
        observedEnums.set(row.enum_name, labels);
      }
      const enumDrift = Object.entries(requiredEnumLabels)
        .filter(
          ([name, labels]) =>
            JSON.stringify(observedEnums.get(name) ?? []) !==
            JSON.stringify(labels),
        )
        .map(([name]) => `enum ${name}`);
      const constraints = await client.query<{
        conname: string;
        definition: string;
      }>(
        `select conname, pg_get_constraintdef(oid, true) as definition
           from pg_constraint
          where connamespace = 'public'::regnamespace
            and conname = any($1::text[])`,
        [[...requiredLedgerConstraints]],
      );
      constraints.rows.sort((left, right) =>
        left.conname.localeCompare(right.conname),
      );
      const constraintNames = new Set(
        constraints.rows.map((row) => row.conname),
      );
      const constraintsFingerprint = createHash("sha256")
        .update(JSON.stringify(constraints.rows))
        .digest("hex");
      const indexes = await client.query<{
        indexname: string;
        definition: string;
      }>(
        `select index_class.relname as indexname,
                pg_get_indexdef(indexes.indexrelid) as definition
           from pg_index indexes
           join pg_class index_class on index_class.oid = indexes.indexrelid
          where index_class.relname = any($1::text[])`,
        [[...requiredLedgerIndexes]],
      );
      indexes.rows.sort((left, right) =>
        left.indexname.localeCompare(right.indexname),
      );
      const indexNames = new Set(indexes.rows.map((row) => row.indexname));
      const indexesFingerprint = createHash("sha256")
        .update(JSON.stringify(indexes.rows))
        .digest("hex");
      const trigger = await client.query<{ present: boolean }>(
        `select exists (
           select 1
             from pg_trigger trigger
             join pg_proc function on function.oid = trigger.tgfoid
            where trigger.tgname = 'invoice_audit_events_append_only'
              and trigger.tgrelid = 'invoice_audit_events'::regclass
              and function.proname = 'reject_invoice_audit_mutation'
              and pg_get_triggerdef(trigger.oid, true) =
                'CREATE TRIGGER invoice_audit_events_append_only BEFORE DELETE OR UPDATE ON invoice_audit_events FOR EACH ROW EXECUTE FUNCTION reject_invoice_audit_mutation()'
              and not trigger.tgisinternal
         ) as present`,
      );
      const auditFunction = await client.query<{ prosrc: string }>(
        `select prosrc
           from pg_proc
          where proname = 'reject_invoice_audit_mutation'
            and pronamespace = 'public'::regnamespace`,
      );
      const auditFunctionHash = auditFunction.rows[0]
        ? createHash("sha256")
            .update(auditFunction.rows[0].prosrc)
            .digest("hex")
        : null;
      const missingLedgerObjects = [
        ...ledgerColumnDrift,
        ...enumDrift,
        ...requiredLedgerConstraints
          .filter((name) => !constraintNames.has(name))
          .map((name) => `constraint ${name}`),
        ...requiredLedgerIndexes
          .filter((name) => !indexNames.has(name))
          .map((name) => `index ${name}`),
        ...(constraintsFingerprint === ledgerConstraintFingerprint
          ? []
          : ["constraint definitions"]),
        ...(indexesFingerprint === ledgerIndexFingerprint
          ? []
          : ["index definitions"]),
        ...(trigger.rows[0]?.present
          ? []
          : ["trigger invoice_audit_events_append_only"]),
        ...(auditFunctionHash === auditFunctionFingerprint
          ? []
          : ["function reject_invoice_audit_mutation"]),
      ];
      if (missingLedgerObjects.length > 0) {
        throw new Error(
          `Brownfield migration preflight failed: journaled invoice ledger is incompatible (${missingLedgerObjects.join(", ")})`,
        );
      }

      const sourceRecorded = await client.query<{ applied: boolean }>(
        `select exists (
           select 1 from drizzle.__drizzle_migrations
            where created_at = 1784764802000
         ) as applied`,
      );
      if (sourceRecorded.rows[0]?.applied) {
        const sourceColumns = await client.query<{
          table_name: string;
          column_name: string;
          data_type: string;
          is_nullable: "YES" | "NO";
        }>(
          `select table_name, column_name, data_type, is_nullable
             from information_schema.columns
            where table_schema = 'public'
              and table_name = any($1::text[])`,
          [Object.keys(requiredPrivateSourceColumns)],
        );
        const observed = new Map<string, Set<string>>();
        const observedShapes = new Map<
          string,
          { type: string; nullable: boolean }
        >();
        for (const row of sourceColumns.rows) {
          const names = observed.get(row.table_name) ?? new Set<string>();
          names.add(row.column_name);
          observed.set(row.table_name, names);
          observedShapes.set(`${row.table_name}.${row.column_name}`, {
            type: row.data_type,
            nullable: row.is_nullable === "YES",
          });
        }
        const drift: string[] = [];
        for (const [table, expectedColumns] of Object.entries(
          requiredPrivateSourceColumns,
        )) {
          const actualColumns = observed.get(table) ?? new Set<string>();
          for (const column of expectedColumns) {
            if (!actualColumns.has(column)) {
              drift.push(`missing column ${table}.${column}`);
            }
          }
          for (const column of actualColumns) {
            if (!expectedColumns.includes(column)) {
              drift.push(`unexpected column ${table}.${column}`);
            }
          }
        }
        for (const [column, expected] of Object.entries(
          requiredPrivateSourceShapes,
        )) {
          const actual = observedShapes.get(column);
          if (
            !actual ||
            actual.type !== expected.type ||
            actual.nullable !== expected.nullable
          ) {
            drift.push(`incompatible column ${column}`);
          }
        }
        const constraints = await client.query<{
          conname: string;
          table_name: string;
          definition: string;
        }>(
          `select conname, conrelid::regclass::text as table_name,
                  pg_get_constraintdef(oid, true) as definition
             from pg_constraint
            where connamespace = 'public'::regnamespace
              and conname = any($1::text[])
            order by conname`,
          [[...requiredPrivateSourceConstraints]],
        );
        const constraintNames = new Set(
          constraints.rows.map((row) => row.conname),
        );
        drift.push(
          ...requiredPrivateSourceConstraints
            .filter((name) => !constraintNames.has(name))
            .map((name) => `constraint ${name}`),
        );
        for (const constraint of constraints.rows) {
          if (
            constraint.table_name !==
            privateConstraintTables[constraint.conname]
          ) {
            drift.push(`misbound constraint ${constraint.conname}`);
          }
          if (!constraint.definition.trim()) {
            drift.push(`empty constraint ${constraint.conname}`);
          }
        }
        if (
          createHash("sha256")
            .update(JSON.stringify(constraints.rows))
            .digest("hex") !== privateSourceConstraintFingerprint
        ) {
          drift.push("private source constraint definitions");
        }
        const indexes = await client.query<{
          indexname: string;
          table_name: string;
          definition: string;
        }>(
          `select index_class.relname as indexname,
                  table_class.relname as table_name,
                  pg_get_indexdef(indexes.indexrelid) as definition
             from pg_index indexes
             join pg_class index_class on index_class.oid = indexes.indexrelid
             join pg_class table_class on table_class.oid = indexes.indrelid
            where index_class.relname = any($1::text[])
            order by index_class.relname`,
          [[...requiredPrivateSourceIndexes]],
        );
        const indexNames = new Set(indexes.rows.map((row) => row.indexname));
        drift.push(
          ...requiredPrivateSourceIndexes
            .filter((name) => !indexNames.has(name))
            .map((name) => `index ${name}`),
        );
        for (const index of indexes.rows) {
          if (index.table_name !== "invoice_source_assets") {
            drift.push(`misbound index ${index.indexname}`);
          }
          if (!index.definition.includes("invoice_source_assets")) {
            drift.push(`incompatible index ${index.indexname}`);
          }
        }
        if (
          createHash("sha256")
            .update(JSON.stringify(indexes.rows))
            .digest("hex") !== privateSourceIndexFingerprint
        ) {
          drift.push("private source index definitions");
        }
        const lifecycle = await client.query<{ enumlabel: string }>(
          `select value.enumlabel
             from pg_type type
             join pg_enum value on value.enumtypid = type.oid
            where type.typname = 'invoice_source_asset_lifecycle'
            order by value.enumsortorder`,
        );
        if (
          JSON.stringify(lifecycle.rows.map((row) => row.enumlabel)) !==
          JSON.stringify(["staging", "verified", "attached", "deleted"])
        ) {
          drift.push("enum invoice_source_asset_lifecycle");
        }
        if (drift.length) {
          throw new Error(
            `Brownfield migration preflight failed: journaled private invoice sources are incompatible (${drift.join(", ")})`,
          );
        }
      }
    }
  }
}
