---
name: Dual Auth Architecture
description: How Replit OIDC and local email/password auth coexist in the same session system.
---

## Rule
Both Replit OIDC users and local email/password users share the same Express session store (`sessions` table). The session distinguishes them by the `localUserId` key.

**Why:** Replit OIDC is for shop owners who set up via Replit; local auth is for team members created by admins. Both must be first-class citizens.

## How to apply
- `isAuthenticated` middleware (in `server/replitAuth.ts`) checks `req.session?.localUserId` FIRST; if set, passes through without touching Replit OIDC token flow.
- `resolveUserId(req)` helper (top of `server/routes.ts`) returns `req.session?.localUserId || req.user?.claims?.sub`.
- Use `resolveUserId(req)` everywhere a userId is needed — NOT `req.user.claims.sub` directly.
- `/api/auth/user` response includes `authSource: 'local' | 'replit'` — used on frontend to decide which logout endpoint to call.
- Local logout: `POST /api/auth/local/logout` (deletes session key). Replit logout: `GET /api/logout` (OIDC end-session).
- `passwordHash` and `mustChangePassword` columns on users table (nullable — null for Replit users).
- bcryptjs (pure JS, no native deps) used for hashing — rounds: 12.
