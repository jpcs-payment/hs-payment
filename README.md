# JPCS - LCC Payment and QR Ticketing System

Local React + Vite payment, Supabase data, Brevo email, QR ticket, and attendance system for Junior Philippines Computer Studies.

## Run locally

```bash
npm install
npm run dev
```

The root route is the public Film Showing payment form. The local admin route is `/admin/login`.

On Vercel, open `/admin/login` after deploying. The included `vercel.json` rewrite keeps React Router routes working when opened directly. The `api/` functions handle approval and Pay Later emails in production.

`npm run dev` starts Vite and the local Brevo bridge at `http://127.0.0.1:8787`. Brevo credentials are read only by `server/email-server.mjs`.

## Environment

Create `.env` from `.env.example` and set:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
SUPABASE_SERVICE_ROLE_KEY=server_only_service_role_key
BREVO_API_KEY=xkeysib_your_key
BREVO_FROM_EMAIL=jpcslccpayment@gmail.com
BREVO_FROM_NAME=JPCS - LCC Payment Portal
BREVO_REPLY_TO=jpcs.payment@gmail.com
EMAIL_SERVER_PORT=8787
```

The Brevo sender must be verified in Brevo. On Vercel, add `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `BREVO_REPLY_TO`, `VITE_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` as server/project environment variables. Never commit `.env` or place server secrets in `VITE_` variables.

## Supabase

The migrations are in `supabase/migrations/`. The initial migration creates the `hs-` tables, storage bucket, admin policies, and Film Showing offering. The follow-up migrations add College support, reusable payment offerings, dynamic allocation destinations, Pay Later reservations, payment attribution, and secure approval/rejection actions. Apply them in filename order.

After authenticating the Supabase CLI with access to the target project:

```bash
supabase link --project-ref fjulkxdhdskftnkwmsyz
supabase db push
```

Do not rerun the initial migration manually after the database has data. The follow-up migration is forward-only and backfills existing revenue splits into allocation rows.

If the linked project reports remote migrations such as `001`-`004` instead of these repository timestamps, stop before `supabase db push` and reconcile the migration history/schema in the Supabase SQL Editor first.

The Supabase Auth admin email must also exist in `public."hs-admins"`; use the exact email of the Supabase Auth account that should access `/admin/login`.

## Attendance

Open `/admin/attendance` after signing in. Start the camera and scan an approved ticket QR. Manual ticket IDs and full QR payloads are also supported. Camera access works on `localhost`; other devices generally require HTTPS.

## Build check

```bash
npm run build
```
