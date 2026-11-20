# PBC Project Control Management

Vite + React + TypeScript project control workspace for M1009/PBC routine maintenance of footbridges and pedestrian subways in Dubai.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Official project sources retained

- `public/data/PBC-Dashboard-Source.xlsx` — exact original Excel workbook, all 15 worksheets preserved byte-for-byte.
- `public/data/PBC-Bridge-Locations.kml` — original KML source.
- `public/data/pbc-assets.geojson` — GIS features converted from the KML. Point and polygon geometries are supported; unmatched geometry remains marked for manual review.
- `public/data/Asset-List-Source.pdf` — original asset list PDF.
- `public/data/pbc-assets-master.json` — structured asset register extracted from the PDF: 71 footbridges and 9 pedestrian subways (80 assets total).

The GIS file contains 114 features (93 points and 21 polygons). Those features are not treated as 114 distinct assets. The asset cards use the 80-row PDF asset register. Exact Field ID matches are enriched automatically; unmatched GIS features are not forced onto an asset.

## Supabase environment

Set these Vercel environment variables for Production (and Preview/Development if required):

- `VITE_SUPABASE_URL` — `https://<project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — Supabase publishable/anon key.

Never put a Supabase `service_role` key in frontend code or in a `VITE_` variable. In Supabase Authentication → URL Configuration, set the Site URL to the current production Vercel URL and add that URL (plus the Vercel preview pattern if needed) to the Redirect URLs allow-list. The app sends the current deployed origin as the email-confirmation redirect, preventing confirmation links from returning to `localhost`.

## Supabase SQL deployment order

Run the following files in the Supabase SQL Editor:

1. `supabase/schema.sql` — initial shared database schema (if not already applied).
2. `supabase/attachments-migration.sql` — attachment table and private Storage bucket (if not already applied).
3. `supabase/production-upgrade.sql` — role-aware RLS, user-profile bootstrap, administrator user-management RPCs, audit visibility and configurable payment SLA setting.
4. `supabase/assets-seed.sql` — imports the authoritative 80 assets from the PDF and links project records to assets only on exact Field ID matches.

After step 3, open `production-upgrade.sql`, copy the commented bootstrap statement at the bottom, replace `YOUR_ADMIN_EMAIL` with the administrator's registered email, and execute that statement separately. New accounts start as `Consultant / Viewer`; only an administrator can assign other roles from User Management.

The production-upgrade SQL is designed to replace the permissive starter RLS policies. Do not invite external users until the role assignment and access model has been reviewed by the project administrator.

## Implemented workspace capabilities

- Shared Supabase authentication and central project register.
- Original Excel sheets and columns retained in JSONB during import.
- Work Orders, Civil & MEP, Daily Updates, NCR, Risks & Issues, Change Requests, Payments, Deadlines, Client Satisfaction, Source Archive and Update History sections.
- Section-level KPI summaries and status charts, with source-driven values and no fabricated data.
- Professional executive dashboard with work-order status, Civil/MEP split, assets, risk, NCR, revenue, satisfaction and deadlines.
- Sites & Assets register based on the 80-row asset list, with GIS map markers and polygon centroid support.
- Asset Profile opened from a map marker or asset card; displays Field ID, Maximo identifiers, type, community, owner, SOR category, coordinates, linked work orders, NCR, risks and attachments.
- Asset creation/editing for authorized roles. Asset file attachments are supported once the asset has a shared database ID.
- Multi-file attachments on project records in every register. Attachments are stored in private Supabase Storage and metadata is linked to the record; download/open links and print/PDF attachment sections are included.
- Asset-level attachments, record-level attachments and report-level attachment collections.
- Source payment certificate history is extracted into a derived `Payment Certificates` register from the three year blocks in the Contract Financial Details worksheet; the original 15-sheet workbook remains unchanged. New payment certificate workflow fields include submission to consultant, consultant approval, contractual client payment due date, payment date, certified amount and paid amount. Consultant approval SLA defaults to 28 days and is configurable centrally by Administrator. Client-payment overdue is calculated only when a contractual due date is entered.
- User Management page for administrators to assign workspace roles. Supabase RLS enforces role-based permissions server-side.
- Audit history reads from the shared `audit_logs` table.
- Professional report cover, executive summary, status analysis, detailed records and supporting documents; Excel export is also available.

## Roles

- Administrator — full access, user management and settings.
- Project Manager — project-wide editing and import.
- Technical Engineer — technical/work-order, daily update, NCR and risk registers.
- Site Engineer — site/work-order, daily update and NCR registers.
- QS / Commercial — payment, change request and deadline registers.
- Finance — payment register.
- Consultant / Viewer — read-only.

The UI hides actions that the role cannot perform, and RLS policies independently enforce the same access restrictions in Supabase.

## Data integrity notes

- Excel and PDF source files are retained in the repository; the Excel workbook is not overwritten by live entries.
- Excel imports replace imported rows by source sheet only. User-created records are retained.
- Existing source columns are preserved in `project_records.data`.
- Asset matching uses exact Field ID values. Similar names or nearby coordinates alone are not treated as proof of identity.
- The 28-day SLA applies only to consultant approval. Client payment timing must be entered from the relevant contract/payment terms; the system does not invent a payment period.
- The private attachment bucket is configured for files up to 25 MB each. All file types are accepted by the app and retained with MIME metadata; the user's browser may preview only supported formats. Other documents are available as secure download links in PDF reports.

## Deployment checklist

1. Apply the Supabase SQL files in the order above and bootstrap the first Administrator.
2. Confirm the Vercel environment variables are set for Production.
3. Upload/commit this project to the connected GitHub `main` branch, or replace the project files using the Vercel deployment workflow.
4. Wait for Vercel Build to show **Ready**; a successful upload alone does not mean deployment succeeded.
5. Sign in as Administrator, confirm the shared Excel import and asset register, and test adding/editing one record and one attachment in each relevant role.
6. Verify report printing, PDF attachment links, and asset profiles before inviting the wider project team.

A local `npm run build` could not be completed in the authoring environment because npm registry access timed out. The TSX/TypeScript source was syntax-transpiled successfully, but a full dependency-backed build and live Supabase/Vercel test are still required before production release.
