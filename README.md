# PBC Project Control Management

Vite + React + TypeScript project dashboard for M1009/PBC routine maintenance of footbridges and pedestrian subways in Dubai.

## Run

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

The app loads the packaged workbook at startup and supports Excel re-import. The source workbook is never overwritten by browser edits.

## Current implementation notes

- Report builder supports report selection, custom start/end dates, section filtering, asset filtering, Excel export, and print-to-PDF layout.
- Work orders are read from the Civil and MEP task sheets using their row-21 headers. NCR, risk, issue and change request tables use the corresponding source header rows.
- GIS features are listed from the packaged GeoJSON. Asset-to-record matching is based on exact displayed asset/field names only; unmatched records are not silently assigned.
- Role selection is a UI preview only. Secure authentication, server-side role enforcement, shared multi-user persistence, audit storage, and approval workflows require a backend and must not be treated as production security features.
- Manual records are held in browser memory for the active session. Daily updates, payment certificate date workflow, photo storage, full asset profiles, and automatic image-linked PDF sections require further backend/data-model implementation.
- Print-to-PDF uses the browser print dialog. Choose Save as PDF and enable background graphics for the designed cover/table styling.
