CREATE TABLE "admin_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" varchar NOT NULL,
	"target_company_id" varchar,
	"action" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'basic' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "company_integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"qb_transaction_type" text DEFAULT 'bill',
	"qb_debit_account" text DEFAULT 'Inventory Asset',
	"qb_credit_account" text DEFAULT 'Accounts Payable',
	"oauth_access_token" text,
	"oauth_refresh_token" text,
	"oauth_expires_at" timestamp,
	"oauth_realm_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"company_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "inventory_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" varchar NOT NULL,
	"previous_qty" integer NOT NULL,
	"new_qty" integer NOT NULL,
	"delta" integer NOT NULL,
	"adjustment_type" text NOT NULL,
	"reason" text NOT NULL,
	"reference_note" text,
	"count_session_id" varchar,
	"user_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "inventory_count_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"part_id" varchar NOT NULL,
	"system_qty_snapshot" integer NOT NULL,
	"counted_qty" integer,
	"variance" integer,
	"company_id" varchar NOT NULL
);

CREATE TABLE "inventory_count_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"started_by_user_id" varchar,
	"submitted_at" timestamp,
	"reviewed_by_user_id" varchar,
	"reviewed_at" timestamp,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "inventory_intake_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_intake_id" varchar NOT NULL,
	"part_id" varchar,
	"part_name_snapshot" text NOT NULL,
	"part_number_snapshot" text DEFAULT '' NOT NULL,
	"item_type" text DEFAULT 'inventory' NOT NULL,
	"group_id" varchar,
	"subgroup_id" varchar,
	"qty" integer NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"landed_cost" numeric(12, 4),
	"company_id" varchar NOT NULL,
	"quickbooks_sync_status" text DEFAULT 'not_synced',
	"quickbooks_id" text,
	"quickbooks_last_synced_at" timestamp,
	"external_reference_number" text,
	"qb_transaction_type" text,
	"qb_debit_account" text,
	"qb_credit_account" text,
	"qb_vendor_name" text,
	"qb_invoice_number" text,
	"qb_amount" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "inventory_intakes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" text NOT NULL,
	"invoice_number" text,
	"invoice_date" timestamp,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"delivery_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reconciliation_status" text DEFAULT 'unmatched' NOT NULL,
	"notes" text,
	"company_id" varchar NOT NULL,
	"created_by_user_id" varchar,
	"quickbooks_sync_status" text DEFAULT 'not_synced',
	"quickbooks_id" text,
	"quickbooks_last_synced_at" timestamp,
	"external_reference_number" text,
	"invoice_photo_url" text,
	"qb_transaction_type" text,
	"qb_debit_account" text,
	"qb_credit_account" text,
	"qb_vendor_name" text,
	"qb_invoice_number" text,
	"qb_amount" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "inventory_parts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"part_number" text NOT NULL,
	"description" text,
	"category" text,
	"item_type" text DEFAULT 'inventory' NOT NULL,
	"group_id" varchar,
	"subgroup_id" varchar,
	"price" numeric(10, 2) NOT NULL,
	"quantity_in_stock" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"company_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repair_order_id" varchar NOT NULL,
	"customer_id" varchar,
	"company_id" varchar NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"quickbooks_sync_status" text DEFAULT 'not_synced',
	"quickbooks_id" text,
	"quickbooks_last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "maintenance_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"company_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "maintenance_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subgroup_id" varchar NOT NULL,
	"part_id" varchar,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"company_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "maintenance_subgroups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"group_id" varchar NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"company_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "mechanics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"specialization" text NOT NULL,
	"phone" text,
	"email" text,
	"cdl_class" text,
	"hourly_rate" numeric(10, 2) NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"current_workload" integer DEFAULT 0 NOT NULL,
	"max_workload" integer DEFAULT 40 NOT NULL,
	"company_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "parts_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repair_order_id" varchar NOT NULL,
	"part_id" varchar NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"group_snapshot" text,
	"subgroup_snapshot" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "repair_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"vehicle_id" varchar NOT NULL,
	"customer_id" varchar,
	"mechanic_id" varchar,
	"inspector_id" varchar NOT NULL,
	"customer_type" text DEFAULT 'company-fleet' NOT NULL,
	"service_type" text,
	"truck_type" text,
	"trailer_number" text,
	"odometer_in" integer,
	"odometer_out" integer,
	"dot_inspection_required" boolean DEFAULT false,
	"scheduled_date" timestamp,
	"completed_date" timestamp,
	"closed_date" timestamp,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"estimated_hours" numeric(5, 2),
	"actual_hours" numeric(5, 2) DEFAULT '0',
	"labor_rate" numeric(10, 2),
	"total_estimate" numeric(10, 2),
	"progress_notes" text,
	"damage_photos" text[],
	"company_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repair_orders_order_number_unique" UNIQUE("order_number")
);

CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);

CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" text DEFAULT 'shop_user' NOT NULL,
	"company_id" varchar NOT NULL,
	"password_hash" text,
	"must_change_password" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "vehicles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"vin" text,
	"license_plate" text,
	"color" text,
	"mileage" integer,
	"customer_id" varchar,
	"company_id" varchar NOT NULL,
	"tractor_number" text,
	"unit_status" text,
	"fleet_type" text,
	"truck_type" text,
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_company_id_companies_id_fk" FOREIGN KEY ("target_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "company_integrations" ADD CONSTRAINT "company_integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_part_id_inventory_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."inventory_parts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_count_session_id_inventory_count_sessions_id_fk" FOREIGN KEY ("count_session_id") REFERENCES "public"."inventory_count_sessions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_session_id_inventory_count_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."inventory_count_sessions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_part_id_inventory_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."inventory_parts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_intake_items" ADD CONSTRAINT "inventory_intake_items_inventory_intake_id_inventory_intakes_id_fk" FOREIGN KEY ("inventory_intake_id") REFERENCES "public"."inventory_intakes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_intake_items" ADD CONSTRAINT "inventory_intake_items_part_id_inventory_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."inventory_parts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_intake_items" ADD CONSTRAINT "inventory_intake_items_group_id_maintenance_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."maintenance_groups"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_intake_items" ADD CONSTRAINT "inventory_intake_items_subgroup_id_maintenance_subgroups_id_fk" FOREIGN KEY ("subgroup_id") REFERENCES "public"."maintenance_subgroups"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_intake_items" ADD CONSTRAINT "inventory_intake_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_intakes" ADD CONSTRAINT "inventory_intakes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_intakes" ADD CONSTRAINT "inventory_intakes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_parts" ADD CONSTRAINT "inventory_parts_group_id_maintenance_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."maintenance_groups"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_parts" ADD CONSTRAINT "inventory_parts_subgroup_id_maintenance_subgroups_id_fk" FOREIGN KEY ("subgroup_id") REFERENCES "public"."maintenance_subgroups"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_parts" ADD CONSTRAINT "inventory_parts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "maintenance_groups" ADD CONSTRAINT "maintenance_groups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_subgroup_id_maintenance_subgroups_id_fk" FOREIGN KEY ("subgroup_id") REFERENCES "public"."maintenance_subgroups"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_part_id_inventory_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."inventory_parts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "maintenance_subgroups" ADD CONSTRAINT "maintenance_subgroups_group_id_maintenance_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."maintenance_groups"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "maintenance_subgroups" ADD CONSTRAINT "maintenance_subgroups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mechanics" ADD CONSTRAINT "mechanics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "parts_usage" ADD CONSTRAINT "parts_usage_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "parts_usage" ADD CONSTRAINT "parts_usage_part_id_inventory_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."inventory_parts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_mechanic_id_mechanics_id_fk" FOREIGN KEY ("mechanic_id") REFERENCES "public"."mechanics"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "company_integrations_company_provider_idx" ON "company_integrations" USING btree ("company_id","provider");
CREATE UNIQUE INDEX "unique_draft_per_company" ON "inventory_count_sessions" USING btree ("company_id") WHERE status = 'draft';
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");

-- Synthetic sentinel rows prove that additive migrations preserve Brownfield
-- identifiers, counts, and QuickBooks handoff columns.
INSERT INTO "companies" ("id", "name", "plan")
VALUES ('00000000-0000-4000-8000-000000000101', 'Migration Sentinel Shop', 'basic');

INSERT INTO "users" ("id", "email", "role", "company_id")
VALUES (
  '00000000-0000-4000-8000-000000000102',
  'migration-sentinel@example.invalid',
  'admin',
  '00000000-0000-4000-8000-000000000101'
);

INSERT INTO "company_integrations" (
  "id", "company_id", "provider", "qb_transaction_type",
  "qb_debit_account", "qb_credit_account"
) VALUES (
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000101',
  'quickbooks',
  'bill',
  'Inventory Asset',
  'Accounts Payable'
);

INSERT INTO "inventory_intakes" (
  "id", "vendor", "invoice_number", "subtotal", "tax_amount",
  "delivery_fee", "total_amount", "reconciliation_status", "company_id",
  "created_by_user_id", "quickbooks_sync_status", "quickbooks_id",
  "qb_transaction_type", "qb_debit_account", "qb_credit_account",
  "qb_vendor_name", "qb_invoice_number", "qb_amount"
) VALUES (
  '00000000-0000-4000-8000-000000000104',
  'Synthetic Vendor',
  'SENTINEL-001',
  10.00,
  1.00,
  0.00,
  11.00,
  'matched',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  'pending',
  'qb-sentinel-intake',
  'bill',
  'Inventory Asset',
  'Accounts Payable',
  'Synthetic Vendor',
  'SENTINEL-001',
  11.00
);

INSERT INTO "inventory_intake_items" (
  "id", "inventory_intake_id", "part_name_snapshot",
  "part_number_snapshot", "item_type", "qty", "unit_cost", "line_total",
  "company_id", "quickbooks_sync_status", "quickbooks_id",
  "qb_transaction_type", "qb_debit_account", "qb_credit_account",
  "qb_vendor_name", "qb_invoice_number", "qb_amount"
) VALUES (
  '00000000-0000-4000-8000-000000000105',
  '00000000-0000-4000-8000-000000000104',
  'Synthetic Part',
  'SENTINEL-PART',
  'inventory',
  1,
  10.00,
  10.00,
  '00000000-0000-4000-8000-000000000101',
  'pending',
  'qb-sentinel-line',
  'bill',
  'Inventory Asset',
  'Accounts Payable',
  'Synthetic Vendor',
  'SENTINEL-001',
  10.00
);
