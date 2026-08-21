# Connection Checklist

Replace only values written in capitals. Never paste secrets into source files.

## 1. Create the hosted project

Create a Supabase project and copy its project reference from the project URL:

```text
https://YOUR_PROJECT_REF.supabase.co
```

## 2. Link and migrate

Run on the device where you will manage deployment:

```powershell
npx supabase login
npm run supabase:link -- --project-ref YOUR_PROJECT_REF
npm run supabase:push:dry
npm run supabase:push
npm run supabase:verify
```

The login command stores its access token in the Supabase CLI credential store,
not in this repository.

## 3. Paste local values

Open the root `.env` and `server/.env`. Each blank field has a `PASTE` comment
showing exactly where its value comes from. Then run:

```powershell
npm run supabase:check
```

All checks must report `PASS`.

## 4. Configure authentication

Supabase Dashboard > Authentication > URL Configuration:

```text
Site URL: http://localhost:5173
Redirect URL: http://localhost:5173/reset-password
```

After Vercel deployment, replace these with the final HTTPS domain and add:

```text
https://YOUR_VERCEL_DOMAIN/reset-password
```

Authentication > Providers > Email and Authentication > Security:

```text
Email/password: enabled
Confirm email: enabled
Minimum password length: 12
Require lowercase, uppercase, number and symbol: enabled
Anonymous sign-ins: disabled
Refresh token rotation: enabled
JWT expiry: 3600 seconds
```

## 5. Configure Vercel

Use `vercel.env.example` as the checklist for Vercel environment variables.
Paste values in the Vercel dashboard, never into `vercel.json`.

After deployment, repeat these tests:

1. Create an account and confirm its email.
2. Sign in and save a generated sidequest.
3. Confirm a row appears in `profiles`, `trips`, `searches`, and `ai_generations`.
4. Request a password reset and complete it at `/reset-password`.