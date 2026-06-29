# HaulMaster Pro — Database Schema Reference
> For QuickBooks integration handoff · Generated June 17, 2026

All tables use `varchar` UUIDs as primary keys (auto-generated via `gen_random_uuid()`).
All data is **company-scoped** — every table carries a `company_id` foreign key for multi-tenant isolation.

---

## Table of Contents
1. [companies](#companies)
2. [users](#users)
3. [customers](#customers)
4. [vehicles](#vehicles)
5. [mechanics](#mechanics)
6. [repair_orders](#repair_orders)
7. [parts_usage](#parts_usage)
8. [inventory_parts](#inventory_parts)
9. [inventory_intakes](#inventory_intakes) ← **QB fields live here**
10. [inventory_intake_items](#inventory_intake_items)
11. [inventory_adjustments](#inventory_adjustments)
12. [inventory_count_sessions](#inventory_count_sessions)
13. [inventory_count_items](#inventory_count_items)
14. [invoices](#invoices) ← **QB fields live here**
15. [maintenance_groups](#maintenance_groups)
16. [maintenance_subgroups](#maintenance_subgroups)
17. [maintenance_items](#maintenance_items)

---

## companies
Tenant root. Every other table references this.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| name | text | Company display name |
| plan | text | `basic` · `pro` · etc. |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## users
Authentication and role management.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| email | varchar UNIQUE | |
| first_name | varchar | |
| last_name | varchar | |
| profile_image_url | varchar | |
| role | text | `super_admin` · `admin` · `accounting` · `shop_user` · `technician` |
| company_id | varchar FK → companies | |
| password_hash | text | Local login only |
| must_change_password | boolean | |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## customers
Owner Operators / external clients.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| name | text | |
| phone | text | |
| email | text | nullable |
| company_id | varchar FK → companies | |
| created_at | timestamp | |

---

## vehicles
Trucks and trailers — both company-owned fleet and customer-owned units.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| year | integer | |
| make | text | |
| model | text | |
| vin | text | nullable |
| license_plate | text | nullable |
| color | text | nullable |
| mileage | integer | nullable |
| customer_id | varchar FK → customers | nullable — null = company fleet vehicle |
| company_id | varchar FK → companies | |
| tractor_number | text | Unit number e.g. "T-042" |
| unit_status | text | `active` · `inactive` · `maintenance` |
| fleet_type | text | `company-fleet` · `external` |
| truck_type | text | `semi-truck` · `box-truck` · `flatbed` · `tanker` · etc. |
| photo_url | text | nullable |
| created_at | timestamp | |

---

## mechanics
Technicians / shop staff.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| name | text | |
| specialization | text | |
| phone | text | nullable |
| email | text | nullable |
| cdl_class | text | `Class A` · `Class B` · `Class C` · `N/A` |
| hourly_rate | decimal(10,2) | |
| is_available | boolean | |
| current_workload | integer | Active order count |
| max_workload | integer | Max hours per period (default 40) |
| company_id | varchar FK → companies | |
| created_at | timestamp | |

---

## repair_orders
Core work order record. Drives labor billing and parts consumption.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| order_number | text UNIQUE | Auto-generated e.g. "WO-00042" |
| vehicle_id | varchar FK → vehicles | |
| customer_id | varchar FK → customers | nullable — null for company-fleet jobs |
| mechanic_id | varchar FK → mechanics | nullable until assigned |
| inspector_id | varchar FK → users | Who created/inspected the order |
| customer_type | text | `company-fleet` · `owner-operator` · `third-party` |
| service_type | text | Engine · Brakes · Tires · DOT Inspection · etc. |
| truck_type | text | mirrors vehicles.truck_type |
| trailer_number | text | nullable |
| odometer_in | integer | nullable |
| odometer_out | integer | nullable |
| dot_inspection_required | boolean | |
| scheduled_date | timestamp | nullable |
| completed_date | timestamp | nullable |
| closed_date | timestamp | nullable |
| description | text | |
| priority | text | `low` · `medium` · `high` · `urgent` |
| status | text | `open` → `in-progress` → `on-hold` → `completed` → `delivered` → `closed` / `abandoned` |
| estimated_hours | decimal(5,2) | nullable |
| actual_hours | decimal(5,2) | default 0 |
| labor_rate | decimal(10,2) | nullable |
| total_estimate | decimal(10,2) | nullable |
| progress_notes | text | nullable |
| damage_photos | text[] | Array of file paths |
| company_id | varchar FK → companies | |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## parts_usage
Links parts consumed to a repair order (junction table). Decrements `inventory_parts.quantity_in_stock` on write.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| repair_order_id | varchar FK → repair_orders | |
| part_id | varchar FK → inventory_parts | |
| quantity | integer | |
| unit_price | decimal(10,2) | Price at time of use |
| group_snapshot | text | Catalog group name at time of use |
| subgroup_snapshot | text | Catalog subgroup name at time of use |
| created_at | timestamp | |

---

## inventory_parts
Parts catalog / stock master.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| name | text | |
| part_number | text | |
| description | text | nullable |
| category | text | nullable |
| item_type | text | `inventory` · `consumable` — drives QB treatment |
| group_id | varchar FK → maintenance_groups | nullable — catalog hierarchy link |
| subgroup_id | varchar FK → maintenance_subgroups | nullable |
| price | decimal(10,2) | Sell price |
| quantity_in_stock | integer | Live stock level |
| low_stock_threshold | integer | default 5 — triggers notifications |
| company_id | varchar FK → companies | |
| created_at | timestamp | |

---

## inventory_intakes
Vendor invoice / receiving header record. **Primary QB sync target for AP transactions.**

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| vendor | text | Vendor name |
| invoice_number | text | nullable — vendor's invoice number |
| invoice_date | timestamp | nullable |
| subtotal | decimal(12,2) | |
| tax_amount | decimal(12,2) | |
| delivery_fee | decimal(12,2) | |
| total_amount | decimal(12,2) | |
| reconciliation_status | text | `matched` · `warning` · `unmatched` |
| notes | text | nullable |
| company_id | varchar FK → companies | |
| created_by_user_id | varchar FK → users | nullable |
| invoice_photo_url | text | Attached invoice scan |
| external_reference_number | text | nullable |
| **quickbooks_sync_status** | text | `not_synced` · `synced` · `error` |
| **quickbooks_id** | text | QB transaction ID after sync |
| **quickbooks_last_synced_at** | timestamp | nullable |
| **qb_transaction_type** | text | e.g. `Bill` · `Check` · `Credit Card` |
| **qb_debit_account** | text | QB chart-of-accounts debit side |
| **qb_credit_account** | text | QB chart-of-accounts credit side |
| **qb_vendor_name** | text | Vendor name as it appears in QB |
| **qb_invoice_number** | text | Invoice number for QB |
| **qb_amount** | decimal(12,2) | Amount pushed to QB |
| created_at | timestamp | |

> **QB note:** The `qb_*` columns are already in the schema and ready for the integration to populate. `quickbooks_sync_status` should be updated to `synced` after a successful push and `error` on failure.

---

## inventory_intake_items
Line items for each intake. Child of `inventory_intakes`.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| inventory_intake_id | varchar FK → inventory_intakes | |
| part_id | varchar FK → inventory_parts | nullable — may be an unrecognized part |
| part_name_snapshot | text | Part name at time of receiving |
| part_number_snapshot | text | Part number at time of receiving |
| item_type | text | `inventory` · `consumable` |
| group_id | varchar FK → maintenance_groups | nullable |
| subgroup_id | varchar FK → maintenance_subgroups | nullable |
| qty | integer | |
| unit_cost | decimal(12,2) | Cost per unit |
| line_total | decimal(12,2) | qty × unit_cost |
| landed_cost | decimal(12,4) | nullable — cost after prorating delivery/tax |
| company_id | varchar FK → companies | |
| created_at | timestamp | |

---

## inventory_adjustments
Audit trail for all admin stock corrections. Immutable after creation.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| part_id | varchar FK → inventory_parts | |
| previous_qty | integer | Stock before adjustment |
| new_qty | integer | Stock after adjustment |
| delta | integer | Signed change (positive = add, negative = subtract) |
| adjustment_type | text | `add` · `subtract` · `set` |
| reason | text | Free-text reason |
| reference_note | text | nullable |
| count_session_id | varchar FK → inventory_count_sessions | nullable — set when adjustment comes from a count |
| user_id | varchar FK → users | Who made the adjustment |
| company_id | varchar FK → companies | |
| created_at | timestamp | |

---

## inventory_count_sessions
Physical count workflow header. One draft allowed per company at a time.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| company_id | varchar FK → companies | |
| status | text | `draft` → `submitted` → `approved` / `rejected` |
| started_by_user_id | varchar FK → users | nullable |
| submitted_at | timestamp | nullable |
| reviewed_by_user_id | varchar FK → users | nullable |
| reviewed_at | timestamp | nullable |
| admin_notes | text | nullable |
| created_at | timestamp | |

*Unique partial index: only one `draft` session per company at a time.*

---

## inventory_count_items
Individual part counts within a session.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| session_id | varchar FK → inventory_count_sessions | |
| part_id | varchar FK → inventory_parts | |
| system_qty_snapshot | integer | System quantity when count started |
| counted_qty | integer | nullable — filled in by counter |
| variance | integer | nullable — counted_qty − system_qty_snapshot |
| company_id | varchar FK → companies | |

---

## invoices
Customer-facing billing records generated from repair orders. **Secondary QB sync target for AR transactions.**

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| repair_order_id | varchar FK → repair_orders | |
| customer_id | varchar FK → customers | nullable — null for fleet jobs |
| company_id | varchar FK → companies | |
| subtotal | decimal(12,2) | |
| tax_amount | decimal(12,2) | |
| total_amount | decimal(12,2) | |
| status | text | `draft` · `sent` · `paid` · `void` |
| notes | text | nullable |
| **quickbooks_sync_status** | text | `not_synced` · `synced` · `error` |
| **quickbooks_id** | text | QB invoice ID after sync |
| **quickbooks_last_synced_at** | timestamp | nullable |
| created_at | timestamp | |

---

## maintenance_groups
Top level of the 3-tier service catalog (Group → Subgroup → Item).

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| name | text | e.g. "Engine", "Brakes" |
| sort_order | integer | Display order |
| company_id | varchar FK → companies | |
| created_at | timestamp | |

---

## maintenance_subgroups
Mid-level catalog category.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| name | text | e.g. "Cooling System" |
| group_id | varchar FK → maintenance_groups | |
| sort_order | integer | |
| company_id | varchar FK → companies | |
| created_at | timestamp | |

---

## maintenance_items
Leaf-level catalog entry. Can be linked to an inventory part for price auto-fill.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| name | text | e.g. "Coolant Flush" |
| subgroup_id | varchar FK → maintenance_subgroups | |
| part_id | varchar FK → inventory_parts | nullable — links to a part for price lookup |
| sort_order | integer | |
| company_id | varchar FK → companies | |
| created_at | timestamp | |

---

## Key Relationships (summary)

```
companies
  ├── users (role-based access)
  ├── customers (owner operators / external)
  │     └── vehicles ──────────────────────────────────────┐
  ├── vehicles (company fleet — customer_id IS NULL)        │
  ├── mechanics (technicians)                               │
  ├── repair_orders ← vehicle_id, customer_id, mechanic_id ┘
  │     └── parts_usage ← part_id (inventory_parts)
  ├── invoices ← repair_order_id
  ├── inventory_parts
  │     └── inventory_intakes → inventory_intake_items
  ├── inventory_adjustments
  ├── inventory_count_sessions → inventory_count_items
  └── maintenance_groups → maintenance_subgroups → maintenance_items
                                                       └── (optional) inventory_parts
```

---

## QuickBooks Integration — Fields Ready to Use

### AP (Accounts Payable) — `inventory_intakes`
| Field | Purpose |
|---|---|
| `quickbooks_sync_status` | Track sync state: `not_synced` → `synced` / `error` |
| `quickbooks_id` | Store the QB Bill/Check/Expense ID returned after push |
| `quickbooks_last_synced_at` | Timestamp of last successful sync |
| `qb_transaction_type` | Transaction type selected by user (Bill, Check, Credit Card, etc.) |
| `qb_debit_account` | Debit-side chart of accounts |
| `qb_credit_account` | Credit-side chart of accounts |
| `qb_vendor_name` | Vendor as it should appear in QB |
| `qb_invoice_number` | Vendor invoice number for QB reference |
| `qb_amount` | Amount to push (may differ from `total_amount` after manual override) |

### AR (Accounts Receivable) — `invoices`
| Field | Purpose |
|---|---|
| `quickbooks_sync_status` | Track sync state: `not_synced` → `synced` / `error` |
| `quickbooks_id` | Store the QB Invoice ID returned after push |
| `quickbooks_last_synced_at` | Timestamp of last successful sync |

### Recommended QB sync endpoints to build
- `POST /api/quickbooks/sync/intake/:id` — push a single inventory intake as a QB Bill
- `POST /api/quickbooks/sync/invoice/:id` — push a single customer invoice to QB AR
- `GET /api/quickbooks/status` — check OAuth token health
- `POST /api/quickbooks/callback` — OAuth 2.0 redirect handler

### Auth note
QB uses OAuth 2.0. Store tokens in a new `quickbooks_tokens` table (per company) with `access_token`, `refresh_token`, `expires_at`, and `realm_id` (the QB company ID). Never store tokens in `inventory_intakes` or `invoices`.
