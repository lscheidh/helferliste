# Helferliste RuFV Limbach

Online-Helferliste für das jährliche Reitturnier. Mitglieder tragen sich ohne Login
in Schichten ein; der Vorstand pflegt Schichten unter `#/admin`.

- Öffentliche Ansicht: `https://lscheidh.github.io/helferliste/`
- Admin: `…/#/admin` (gemeinsamer Vorstands-Account, hinterlegt als `lukasscheidhauer@gmx.de` in `helfer_is_admin()`)
- Druckansicht: `…/#/print`

## Entwicklung

`npm install`, `.env.local` mit `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` anlegen,
dann `npm run dev`. Tests: `npm test`.

## Datenbank

Supabase (geteilte Instanz mit dem Longier-Planer, eigene `helfer_*`-Tabellen).
Schema: `supabase/001_schema.sql`, Startdaten: `supabase/002_seed_turnier_2026.sql`.
Öffentliche Clients lesen Signups nur über die RPC `helfer_public_signups` (keine
IDs/Telefonnummern); Eintragen/Austragen läuft über `helfer_signup` /
`helfer_cancel_signup`. Neues Jahr: im Admin "Turnier kopieren" und aktiv schalten.

## Deployment

GitHub Actions → GitHub Pages (Workflow `.github/workflows/deploy.yml`, Branch `main`).
Repo-Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
In den Repo-Settings unter Pages die Source "GitHub Actions" wählen.
