# PBC Project Control – Final Handover Package

## Included source material
- `public/data/PBC-Dashboard-Source.xlsx`: the supplied 15-sheet PBC workbook.
- `public/data/PBC-Bridge-Locations.kml`: original Google Earth location file.
- `public/data/pbc-assets.geojson`: converted point features for 114 placemarks found in the KML. Coordinates are `[longitude, latitude]`.

## Run locally
1. Install Node.js LTS.
2. Open a terminal in `pbc-control`.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the local URL shown by Vite.

## Deploy to Vercel
Import the project folder into a Vercel project (or connect a new Git repository). Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.

## Important implementation status
This is a frontend starter plus the verified source workbook and geospatial asset data. It is NOT yet a production-ready multi-user system. Production use requires a persistent database, authentication/role enforcement, secure file storage, server-side import validation, durable audit history, and tested PDF/Excel report generation. Those services need to be configured in an account controlled by the project owner. The existing Vercel site cannot be overwritten without access to its Vercel project.

## Location data
The KML contains 114 point placemarks. The GeoJSON preserves each placemark's name, description (where present), and coordinates. Some placemarks may not correspond one-to-one with workbook asset names; confirm the asset-name mapping before linking live work orders to locations.
