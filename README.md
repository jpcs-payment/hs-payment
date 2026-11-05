# JPCS - LCC Payment and QR Ticketing System

Local React + Vite payment, Supabase data, Brevo email, QR ticket, and attendance system for Junior Philippines Computer Society.

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
BREVO_FROM_NAME=Junior Philippines Computer Society
BREVO_REPLY_TO=jpcs.payment@gmail.com
EMAIL_SERVER_PORT=8787
```

The Brevo sender must be verified in Brevo. On Vercel, add `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `BREVO_REPLY_TO`, `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` as server/project environment variables. `CRON_SECRET` protects the daily Recently Deleted purge endpoint. Never commit `.env` or place server secrets in `VITE_` variables.

## Supabase

 The migrations are in `supabase/migrations/`. The initial migration creates the `hs-` tables, storage bucket, admin policies, and Film Showing offering. The follow-up migrations add College support, reusable payment offerings, dynamic allocation destinations, Pay Later reservations, payment attribution, secure approval/rejection actions, hardened public payment submission with private proof storage, multiple named attendees with one QR ticket per attendee, one payer record per attendee, global public-portal controls with per-payment-type QR generation, proof-only cashless submissions, 30-day Recently Deleted retention, global school-level visibility, and one-email uniqueness. Apply them in filename order, including `20261102000000_multiple_attendees.sql`, `20261102010000_attendee_payers.sql`, `20261105000000_portal_settings_and_qr.sql`, `20261105010000_recently_deleted_and_proof_only.sql`, `20261105020000_fix_public_settings_safe_update.sql`, `20261105030000_raise_attendee_limit_and_email_delivery_index.sql`, and `20261105040000_global_school_level_visibility.sql`.

After authenticating the Supabase CLI with access to the target project:

```bash
supabase link --project-ref fjulkxdhdskftnkwmsyz
supabase db push
```

Do not rerun the initial migration manually after the database has data. The follow-up migrations are forward-only; the multiple-attendee migration backfills one attendee row for each existing payment and preserves legacy parent ticket fields, while the attendee-payer migration backfills missing payer rows, adds payer rows for new attendees, and moves the one-email uniqueness check to the payment record. The portal-settings migration initializes the public portal as open and synchronizes the global attendee-name policy to all payment types.

If the linked project reports remote migrations such as `001`-`004` instead of these repository timestamps, stop before `supabase db push` and reconcile the migration history/schema in the Supabase SQL Editor first.

The Supabase Auth admin email must also exist in `public."hs-admins"`; use the exact email of the Supabase Auth account that should access `/admin/login`.

## Attendance

Open `/admin/attendance` after signing in. Start the camera and scan an approved ticket QR. Manual ticket IDs and full QR payloads are also supported. Camera access works on `localhost`; other devices generally require HTTPS.

## Build check

```bash
npm run build
```
