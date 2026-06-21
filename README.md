# Attune — SMART on FHIR antidepressant decision-support demo

A SMART on FHIR React SPA that launches inside a (simulated) EHR, reads the live
patient + medication list, and renders a sourced antidepressant recommendation.
The recommendation logic is mocked (scripted lines + one real phenoconversion
check). See `docs/superpowers/specs/2026-06-21-attune-design.md`.

## Run locally

```bash
npm install
npm run dev
```

- Offline demo (no EHR needed): open `http://localhost:5173/app?mock=1`
- Run tests: `npm test`

## Demo against the SMART Health IT launcher (dev)

1. `npm run dev` (serves on `http://localhost:5173`).
2. Open https://launch.smarthealthit.org
3. Set **App Launch URL** to `http://localhost:5173/launch`.
4. Pick a patient and launch. The app redirects to `/app` and reads live FHIR.

## Demo against OpenEMR (the "inside a real EHR" demo)

1. Run OpenEMR via Docker (see https://github.com/openemr/openemr — docker-compose).
2. Enable the FHIR API + register a SMART app:
   - Launch URL: `http://localhost:5173/launch`
   - Redirect URI: `http://localhost:5173/app`
   - Scopes: `launch openid fhirUser patient/*.read`
3. From inside OpenEMR, launch the registered Attune app against a patient.

> Hero case needs a patient whose ACTIVE meds include a strong CYP2D6 inhibitor
> (paroxetine / fluoxetine / bupropion). If the chosen patient has none, add a
> paroxetine medication to that patient in OpenEMR, or use `?mock=1`.

## Deploy (optional, for a public redirect URL)

Deploy to Netlify/Vercel. `public/_redirects` handles SPA history fallback on
Netlify; on Vercel add an equivalent rewrite of all routes to `/index.html`.
Register the deployed `/launch` and `/app` URLs with the launcher/OpenEMR.

## Fallback ladder (spec §6)

- SMART launch won't cooperate → use `?mock=1` (offline synthetic data).
- CORS blocks browser→FHIR → add a small Node proxy forwarding FHIR reads.
