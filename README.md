# CarCare Cloud
Private car maintenance web app using Supabase Auth, Postgres and private Storage.

## Setup
1. In Supabase SQL Editor run supabase/schema.sql.
2. Enable Email authentication.
3. The frontend is static and can be hosted on GitHub Pages.
4. Supabase URL and publishable key are configured in index.html. Never use a service-role/secret key in the browser.

Features: multi-car dashboard, regular service as one record with multiple items, maintenance history, private PDF/image documents, and browser A4 print/save-to-PDF.

## Worker API
The Cloudflare Worker gateway is source-controlled under `worker/` and configured by `wrangler.toml` for the existing `carmy-cache` D1 database and `carmy-files` R2 bucket.
