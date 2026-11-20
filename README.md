# PBC Project Control Management

Vite + React + TypeScript project dashboard for M1009/PBC routine maintenance of footbridges and pedestrian subways in Dubai.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Source data

- `public/data/PBC-Dashboard-Source.xlsx` is the supplied original workbook (all 15 worksheets retained).
- `public/data/PBC-Bridge-Locations.kml` is the supplied KML.
- `public/data/pbc-assets.geojson` is the GIS feature collection packaged with the supplied project.

The workbook and GIS files remain packaged as the read-only baseline. On the first authenticated session, workbook rows are copied to the shared database. Subsequent signed-in sessions load the centrally stored imported rows. Importing a replacement workbook replaces only the imported records belonging to each matching source sheet; user-created records (where `is_imported=false`) are not deleted.

## Shared database (Supabase)

The project uses Supabase Auth and the PostgREST API directly (no service-role key is used in the browser).

Set these Vercel environment variables for Production (and Preview/Development if required):

- `VITE_SUPABASE_URL` — `https://<project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — the project's publishable/anon key (`sb_publishable_...` is supported)

The `supabase/schema.sql` file creates the shared workspace tables, audit triggers, RLS policies and private attachments bucket. Run it once in the Supabase SQL Editor. It creates tables only when absent; the trigger refresh statements replace the named triggers. Review and tighten the sample policies before inviting external users.

Users create an account or sign in through the application. If email confirmation is enabled in Supabase Auth, users must verify their email before signing in. Signed-in users can import the official workbook; the first authenticated session migrates the packaged source workbook automatically when the shared project register is empty.

Never put a Supabase `service_role` key in frontend code or in any `VITE_` variable. The publishable/anon key is designed for browser use; database access is controlled by RLS.

## Current integration scope and limitations

- Shared authentication and central persistence for imported Excel register rows are implemented.
- Source sheet names and original row fields are preserved in `project_records.data` JSONB.
- Shared data is loaded for signed-in users; the GIS map continues to use the packaged GeoJSON baseline.
- This is the initial shared-data connection. Full per-role authorization, user-created record forms, file upload/download workflows, payment approval workflow, and asset geometry editing are not yet implemented. The role selector remains a UI preview and must not be treated as a security boundary.
- Excel import replaces imported records sheet-by-sheet. Avoid importing a partial workbook if it omits source sheets you intend to retain.


## Current UI update (November 2026)

- Register rows are interactive: select a row to open its detail/edit view.
- Signed-in users can add and edit shared records in Work Orders, Daily Updates, Civil & MEP, Payments, NCR, Risks, Change Requests, Deadlines and Client Satisfaction.
- Daily Updates include a selectable category.
- Record detail views include a print-to-PDF action.
- A workspace-wide Excel export is available in the top bar; it exports the currently loaded workbook sheets plus the central shared-record register.
- Imported workbook records retain their source-sheet/source-row metadata when edited, and are distinguished from user-created records.
- The GIS map and existing asset profile view are retained.

The full build could not be run in this environment because npm dependency installation timed out. TypeScript/TSX source syntax was checked with the TypeScript transpiler. Attachments upload/preview, hardened server-side role permissions, and a fully designed multi-page PDF report engine remain follow-up implementation items; the current Print/PDF action prints an individual record using the browser print dialog.
