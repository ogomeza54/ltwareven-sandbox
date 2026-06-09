---
name: User Roles Access Matrix
description: What each role can see in the sidebar and do in the app.
---

## Roles
`super_admin` | `admin` | `accounting` | `shop_user` | `technician`

## Sidebar visibility by role
| Nav item | admin | accounting | shop_user/technician |
|---|---|---|---|
| Dashboard | ✅ | ✅ | ✅ |
| Job Intake | ✅ | ❌ | ✅ |
| Work Orders | ✅ | ❌ | ✅ |
| Parts & Inventory | ✅ | ❌ | ✅ |
| Technicians | ✅ | ❌ | ✅ |
| Clients | ✅ | ❌ | ✅ |
| Fleet | ✅ | ❌ | ✅ |
| Invoices | ✅ | ✅ | ❌ |
| Reports | ✅ | ✅ | ✅ |
| Users | ✅ | ❌ | ❌ |
| Super Admin | super_admin only | ❌ | ❌ |

## Implementation
- `getNavForRole(role)` function in `sidebar.tsx` filters `allNavigation` array.
- Inventory page `isAdmin` check gates physical count approve/reject for admin+super_admin only.
- `/api/users` and user CRUD routes gate to admin+super_admin.
- super_admin sees all users across companies; admin sees only own company users.

**Why:** Business decision — accounting only needs financial view; shop floor doesn't see billing.
