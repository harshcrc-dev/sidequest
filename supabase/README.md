# Supabase Setup

The repository contains four ordered, idempotent migrations:

1. `001_initial_schema.sql`: user data, triggers, indexes and RLS.
2. `002_hosting_readiness.sql`: server-only rate limits and geocode cache.
3. `003_database_hardening.sql`: constraints, maintenance and explicit update checks.
4. `004_auth_and_saved_quests.sql`: forced RLS and saved-itinerary constraints.

## Hosted Project

Authenticate and link without placing access tokens or database passwords in files:

```powershell
npx supabase login
npm run supabase:link -- --project-ref YOUR_PROJECT_REF
```

Preview exactly which migrations will run:

```powershell
npm run supabase:push:dry
```

Apply them and verify the resulting schema:

```powershell
npm run supabase:push
npm run supabase:verify
```

Generate authoritative types from the linked database for comparison with the app types:

```powershell
npm run supabase:types
```

The generated file is `src/types/database.generated.ts`. Review it before replacing
the app's named row aliases in `src/types/database.ts`.

## Environment

Set these locally. Never commit their values.

Root `.env`:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
VITE_AI_BACKEND_URL=http://localhost:8787
```

`server/.env`:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Validate presence and separation without printing any values:

```powershell
npm run supabase:check
```

## Authentication URLs

In Supabase Dashboard, open **Authentication > URL Configuration**.

Local:

```text
Site URL: http://localhost:5173
Redirect URL: http://localhost:5173/reset-password
```

Production:

```text
Site URL: https://YOUR_DOMAIN
Redirect URL: https://YOUR_DOMAIN/reset-password
```

In **Authentication > Providers > Email**, keep email/password enabled and turn
on email confirmation. In **Authentication > Security**, set:

```text
Minimum password length: 12
Password requirements: lowercase, uppercase, number and symbol
JWT expiry: 3600 seconds
Anonymous sign-ins: disabled
Refresh token rotation: enabled
```

The local `config.toml` already mirrors these controls. Do not run
`supabase config push` against production until its localhost Site URL and
redirect URLs have been replaced with the final HTTPS domain.

## Local Supabase

Local Supabase requires Docker Desktop or Podman:

```powershell
npm run supabase:start
npm run supabase:reset
```

Docker is optional when using a linked hosted project.