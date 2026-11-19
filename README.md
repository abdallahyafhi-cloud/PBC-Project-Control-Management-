# PBC Project Control – starter build

A Vite + React + TypeScript front-end starter for the PBC Project Control rebuild.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Upload this folder to a Git repository you own, or import it using Vercel's supported project upload workflow.
2. Framework preset: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.

## Current implementation
- Technical-focused navy/teal dashboard shell.
- Responsive sidebar and project overview.
- Excel workbook upload using SheetJS; worksheet rows are read into browser memory.
- Work Order list and manual Work Order creation with Asset selection.
- Separate report selection and Excel export scaffold.
- Placeholder areas for the approved engineering, finance, quality, risk and reporting modules.

## Important production work still required
This is the initial front-end foundation, not a production-ready multi-user system. Before operational use, implement a secure backend/database, authentication and role-based authorization, durable file storage, validated import preview and field mapping, duplicate detection, audit trail, server-side PDF generation, and verified KPI formulas. The uploaded workbook contains legacy formulas including `#REF!`; formulas must be reviewed and mapped before publishing calculated KPIs. Approval SLA defaults to 28 calendar days in the product specification and must be configurable per payment certificate; contract-specific day-count rules should be confirmed before use.
