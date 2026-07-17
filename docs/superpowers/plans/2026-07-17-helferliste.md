# Helferlisten-App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Online-Helferliste für das RuFV-Limbach-Turnier: Helfer tragen sich ohne Login in Schichten ein, der Vorstand pflegt Schichten über einen passwortgeschützten Admin-Bereich.

**Architecture:** React/Vite-SPA mit Hash-Routing (`#/admin`, `#/print`), Daten in der bestehenden Longier-Planer-Supabase-Instanz in neuen `helfer_*`-Tabellen. Eintragen/Austragen läuft über SECURITY-DEFINER-RPCs (Überbesetzungsschutz per `FOR UPDATE`-Lock), Admin-Schreibrechte über RLS + Supabase-Auth. Deployment auf GitHub Pages via GitHub Actions.

**Tech Stack:** React 18, Vite, TypeScript, @supabase/supabase-js, Vitest (+jsdom für localStorage-Tests), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-07-17-helferliste-design.md`

> **Änderung nach Security-Review (2026-07-17, Task 2/3):** Die öffentliche SELECT-Policy auf `helfer_signups` hätte Signup-UUIDs und Telefonnummern für jeden lesbar gemacht (Massen-Austragen + Datenleck möglich). Fix im Schema: Tabelle nur noch für den Admin lesbar; öffentliche Namensliste über neue RPC `helfer_public_signups(p_event_id uuid)` → `(shift_id, name, created_at)`. Konsequenzen für die Frontend-Tasks 4–8: (1) `types.ts` bekommt zusätzlich `PublicSignup = Pick<Signup, 'shift_id' | 'name' | 'created_at'>`; die öffentliche Ansicht nutzt nur `PublicSignup`. (2) `grouping.ts` typisiert Signup-Parameter strukturell als `{ shift_id: string }[]`. (3) `storage.ts` speichert `{ signupId, shiftId }`-Paare statt nackter IDs (`getMySignups()`, `rememberSignup(signupId, shiftId)`, `forgetSignup(signupId)`). (4) `useHelferData` lädt Signups per `rpc('helfer_public_signups', { p_event_id })`. (5) `ShiftCard` zeigt "Meinen Eintrag austragen" auf Schicht-Ebene (Abgleich über gespeicherte `shiftId`), nicht mehr pro Namenszeile. (6) Admin lädt `helfer_signups` weiter direkt (Admin-Policy). Außerdem: Seed-Guard gegen Doppel-Einspielen, Index auf `helfer_signups(shift_id)`. Der Code in den Task-Abschnitten unten ist die Ursprungsfassung — bei Abweichung gilt diese Notiz.

---

## Dateistruktur (Zielbild)

```
helferliste/
├── .github/workflows/deploy.yml     # GitHub-Pages-Deployment
├── supabase/
│   ├── 001_schema.sql               # Tabellen, RLS, RPCs (manuell im SQL-Editor ausführen)
│   └── 002_seed_turnier_2026.sql    # Startdaten aus den Word-Listen
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx                      # Hash-Routing: Public / Admin / Print
│   ├── index.css
│   ├── types.ts                     # HelferEvent, Shift, Signup
│   ├── lib/supabase.ts              # Supabase-Client
│   ├── logic/grouping.ts            # Pure Funktionen: Gruppierung, Status, Fortschritt, Datums-Helfer
│   ├── logic/grouping.test.ts
│   ├── logic/storage.ts             # localStorage: eigene Signup-IDs
│   ├── logic/storage.test.ts
│   ├── hooks/useHelferData.ts       # Laden von Event/Schichten/Einträgen
│   ├── components/PublicView.tsx    # Öffentliche Ansicht (Tabs, Bereiche)
│   ├── components/ShiftCard.tsx     # Einzelne Schicht inkl. Eintragen/Austragen
│   ├── components/PrintView.tsx     # Druckansicht
│   └── components/admin/
│       ├── AdminView.tsx            # Session-Gate
│       ├── AdminLogin.tsx           # Login-Formular
│       └── AdminPanel.tsx           # Event-/Schicht-/Eintrags-Verwaltung inkl. Kopieren
```

---

### Task 1: Projekt-Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `.gitignore`, `.env.local` (nicht committen)

- [ ] **Step 1: Vite-Projekt anlegen**

Im Verzeichnis `C:\Users\Admin\OneDrive\RuFV Limbach\App-Entwicklung\helferliste`:

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install @supabase/supabase-js
npm install -D vitest jsdom
```

Hinweis: `npm create vite .` fragt ggf. wegen vorhandener Dateien (`docs/`, `.git`) – Option "Ignore files and continue" wählen.

- [ ] **Step 2: `vite.config.ts` ersetzen**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/helferliste/',
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 3: Test-Script in `package.json` ergänzen**

In `"scripts"` ergänzen:

```json
"test": "vitest run"
```

- [ ] **Step 4: Scaffold aufräumen**

- `src/App.css` und `src/assets/` löschen, Verweise darauf aus `src/App.tsx` entfernen.
- `src/App.tsx` vorerst ersetzen durch:

```tsx
export default function App() {
  return <h1>Helferliste RuFV Limbach</h1>
}
```

- `src/index.css` komplett ersetzen durch (finale Styles, werden von allen späteren Tasks genutzt):

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  background: #f4f4f0;
  color: #222;
}
.container { max-width: 640px; margin: 0 auto; padding: 12px; }
h1 { font-size: 1.4rem; }
h2 { font-size: 1.1rem; border-bottom: 2px solid #2e7d32; padding-bottom: 4px; margin-top: 24px; }
.subtitle { color: #555; }
.info { text-align: center; padding: 40px 16px; }
.error { color: #b71c1c; }

.tabs { display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap; }
.tab {
  flex: 1; min-width: 100px; padding: 8px; border: 1px solid #ccc; border-radius: 8px;
  background: #fff; cursor: pointer; font-size: 0.95rem;
}
.tab.active { border-color: #2e7d32; background: #e8f5e9; font-weight: 600; }
.tab-progress { display: block; font-size: 0.8rem; color: #555; }

.shift { border: 1px solid #ddd; border-radius: 8px; background: #fff; padding: 12px; margin: 10px 0; }
.shift.open { border-left: 5px solid #ef6c00; }
.shift.full { border-left: 5px solid #2e7d32; opacity: 0.85; }
.shift-head { margin-bottom: 4px; }
.note { color: #666; font-size: 0.9rem; }
.shift-status { font-size: 0.9rem; margin-bottom: 6px; }
.shift.open .shift-status { color: #ef6c00; font-weight: 600; }
.shift.full .shift-status { color: #2e7d32; }
.names { list-style: none; padding: 0; margin: 0 0 8px; }
.names li { padding: 2px 0; }

.btn {
  background: #2e7d32; color: #fff; border: none; border-radius: 6px;
  padding: 8px 16px; font-size: 1rem; cursor: pointer;
}
.btn:disabled { opacity: 0.5; }
.btn.danger { background: #b71c1c; }
.link { background: none; border: none; color: #1565c0; cursor: pointer; padding: 0 6px; font-size: 0.9rem; }
.signup-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.signup-form input, .admin-form input, .admin-form select {
  padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem;
}
.admin-form { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #ddd; }
.admin-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.print-container { max-width: 800px; margin: 0 auto; padding: 16px; background: #fff; }
.print-container table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
.print-container th, .print-container td { border: 1px solid #999; padding: 4px 6px; text-align: left; font-size: 0.9rem; }
@media print {
  .no-print { display: none; }
  .print-day { break-inside: avoid; }
  body { background: #fff; }
}
```

- [ ] **Step 5: `.gitignore` prüfen/ergänzen**

Das Vite-Template legt `.gitignore` an; sicherstellen, dass `node_modules`, `dist` und zusätzlich `.env.local` enthalten sind:

```
node_modules
dist
.env.local
```

- [ ] **Step 6: Build und Tests laufen lassen**

```bash
npm run build
npm test
```

Erwartet: Build erfolgreich; Vitest meldet "No test files found" (Exit-Code kann ≠ 0 sein – okay, ab Task 4 gibt es Tests). Falls `npm test` wegen fehlender Tests fehlschlägt, `"test": "vitest run --passWithNoTests"` verwenden.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: Vite-React-TS-Scaffold mit Basis-Styles"
```

---

### Task 2: Supabase-Schema (manuell auszuführen)

**Files:**
- Create: `supabase/001_schema.sql`

- [ ] **Step 1: Schema-SQL schreiben**

`supabase/001_schema.sql`:

```sql
-- Helferlisten-Schema für RuFV Limbach.
-- Läuft in der bestehenden Longier-Planer-Instanz; berührt deren Tabellen nicht.

create table helfer_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date_from date not null,
  date_to date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table helfer_shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references helfer_events(id) on delete cascade,
  day date not null,
  time_label text not null,
  area text not null,
  title text not null,
  capacity int not null check (capacity > 0),
  note text,
  sort_order int not null default 0
);

create table helfer_signups (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references helfer_shifts(id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

alter table helfer_events enable row level security;
alter table helfer_shifts enable row level security;
alter table helfer_signups enable row level security;

-- Admin-Check: genau der gemeinsame Vorstands-Account.
create or replace function helfer_is_admin()
returns boolean language sql stable as
$$ select coalesce(auth.jwt() ->> 'email', '') = 'vorstand@rufv-limbach.de' $$;

-- Lesen: öffentlich.
create policy "helfer_events_read" on helfer_events for select using (true);
create policy "helfer_shifts_read" on helfer_shifts for select using (true);
create policy "helfer_signups_read" on helfer_signups for select using (true);

-- Schreiben auf Events/Schichten: nur Admin.
create policy "helfer_events_admin" on helfer_events
  for all using (helfer_is_admin()) with check (helfer_is_admin());
create policy "helfer_shifts_admin" on helfer_shifts
  for all using (helfer_is_admin()) with check (helfer_is_admin());

-- Signups: Admin darf löschen; anon hat KEINE direkten Schreibrechte
-- (Eintragen/Austragen nur über die RPCs unten).
create policy "helfer_signups_admin_delete" on helfer_signups
  for delete using (helfer_is_admin());

-- Eintragen mit Überbesetzungsschutz (FOR UPDATE serialisiert parallele Anmeldungen).
create or replace function helfer_signup(p_shift_id uuid, p_name text, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_count int;
  v_id uuid;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'NAME_REQUIRED';
  end if;
  select capacity into v_capacity from helfer_shifts where id = p_shift_id for update;
  if v_capacity is null then
    raise exception 'SHIFT_NOT_FOUND';
  end if;
  select count(*) into v_count from helfer_signups where shift_id = p_shift_id;
  if v_count >= v_capacity then
    raise exception 'SHIFT_FULL';
  end if;
  insert into helfer_signups (shift_id, name, phone)
  values (p_shift_id, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Austragen: nur wer die (unerratbare) Signup-UUID kennt.
create or replace function helfer_cancel_signup(p_signup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from helfer_signups where id = p_signup_id;
end;
$$;

grant execute on function helfer_signup(uuid, text, text) to anon, authenticated;
grant execute on function helfer_cancel_signup(uuid) to anon, authenticated;
```

- [ ] **Step 2: SQL in Supabase ausführen**

Im Supabase-Dashboard der Longier-Planer-Instanz → SQL Editor → Inhalt von `001_schema.sql` einfügen und ausführen. Erwartet: "Success. No rows returned".

- [ ] **Step 3: Admin-Nutzer anlegen**

Dashboard → Authentication → Users → "Add user" → E-Mail `vorstand@rufv-limbach.de`, sicheres Passwort vergeben (Auto Confirm aktivieren). Passwort an den Nutzer (Lukas) übergeben – landet NICHT im Repo.

- [ ] **Step 4: Schutz verifizieren (SQL Editor)**

```sql
-- Als Kontrolle: direkter anon-Insert muss scheitern, RPC muss funktionieren.
-- (Test-Event + Schicht anlegen, RPC 3x auf capacity-2-Schicht aufrufen: 3. Aufruf → SHIFT_FULL)
insert into helfer_events (name, date_from, date_to, is_active) values ('RLS-Test', '2026-01-01', '2026-01-01', false);
insert into helfer_shifts (event_id, day, time_label, area, title, capacity)
  select id, '2026-01-01', '10:00', 'Test', 'Test', 2 from helfer_events where name = 'RLS-Test';
select helfer_signup((select id from helfer_shifts where title = 'Test'), 'A');
select helfer_signup((select id from helfer_shifts where title = 'Test'), 'B');
select helfer_signup((select id from helfer_shifts where title = 'Test'), 'C'); -- Erwartet: Fehler SHIFT_FULL
delete from helfer_events where name = 'RLS-Test'; -- Aufräumen (kaskadiert)
```

- [ ] **Step 5: Commit**

```bash
git add supabase/001_schema.sql
git commit -m "feat: Supabase-Schema mit RLS und Signup-RPCs"
```

---

### Task 3: Seed-Daten Turnier 2026

**Files:**
- Create: `supabase/002_seed_turnier_2026.sql`

Datenquelle: die analysierten Word-Listen. Essen/Getränke basiert auf der 2025-Struktur (Zeiten passt der Vorstand im Admin an), Schreiber/Leser auf der 2026-Liste. Turnierdatum-Annahme: 04.–06.09.2026 (Fr–So, analog 05.–07.09.2025) – im Admin änderbar.

- [ ] **Step 1: Seed-SQL schreiben**

`supabase/002_seed_turnier_2026.sql`:

```sql
-- Startdaten Turnier 2026. Datum/Zeiten im Admin-Bereich anpassbar.
insert into helfer_events (name, date_from, date_to, is_active)
values ('Turnier 2026', '2026-09-04', '2026-09-06', true);

-- Getränke & Essen: Zeitfenster × Stationen (Struktur aus Liste 2025).
insert into helfer_shifts (event_id, day, time_label, area, title, capacity, note, sort_order)
select e.id, s.day, s.slot, 'Getränke & Essen', st.title, st.cap, st.note, s.sort * 10 + st.ord
from (select id from helfer_events where name = 'Turnier 2026') e,
(values
  (date '2026-09-04', '10:00 – 13:00', 1),
  (date '2026-09-04', '13:00 – 15:30', 2),
  (date '2026-09-04', '15:30 – Ende (ca. 18:45)', 3),
  (date '2026-09-05', '07:30 – 10:00', 1),
  (date '2026-09-05', '10:00 – 12:30', 2),
  (date '2026-09-05', '12:30 – 15:00', 3),
  (date '2026-09-05', '15:00 – 17:00', 4),
  (date '2026-09-05', '17:00 – Ende (ca. 18:45)', 5),
  (date '2026-09-06', '07:30 – 10:00', 1),
  (date '2026-09-06', '10:00 – 12:30', 2),
  (date '2026-09-06', '12:30 – 15:00', 3),
  (date '2026-09-06', '15:00 – Ende (ca. 18:00)', 4)
) as s(day, slot, sort),
(values
  ('Getränke', 2, null, 1),
  ('Kuchen / belegte Brötchen', 2, null, 2),
  ('Warme Speisen', 2, 'nur Ausgabe', 3),
  ('Bonkasse', 1, null, 4)
) as st(title, cap, note, ord);

-- Schreiber & Leser (aus Liste 2026). Schreiber und Leser als getrennte Schichten.
insert into helfer_shifts (event_id, day, time_label, area, title, capacity, note, sort_order)
select e.id, v.day, v.time_label, v.area, v.title, v.cap, v.note, v.ord
from (select id from helfer_events where name = 'Turnier 2026') e,
(values
  -- Freitag Dressurplatz
  (date '2026-09-04', '11:15', 'Schreiber & Leser – Dressurplatz', 'Dressurpferde A – Schreiber', 2, 'Ansage + Aufgabe', 101),
  (date '2026-09-04', '11:15', 'Schreiber & Leser – Dressurplatz', 'Dressurpferde A – Leser/Ansager', 1, null, 102),
  (date '2026-09-04', '12:30', 'Schreiber & Leser – Dressurplatz', 'Dressurpferde L – Schreiber', 1, 'nur Ansage', 103),
  (date '2026-09-04', '12:30', 'Schreiber & Leser – Dressurplatz', 'Dressurpferde L – Leser/Ansager', 1, null, 104),
  (date '2026-09-04', '14:00', 'Schreiber & Leser – Dressurplatz', 'Dressurreiter A – Schreiber', 2, 'Ansage + Aufgabe', 105),
  (date '2026-09-04', '14:00', 'Schreiber & Leser – Dressurplatz', 'Dressurreiter A – Leser/Ansager', 1, null, 106),
  (date '2026-09-04', '15:00', 'Schreiber & Leser – Dressurplatz', 'L-Dressur – Schreiber', 1, 'nur Ansage', 107),
  (date '2026-09-04', '15:00', 'Schreiber & Leser – Dressurplatz', 'L-Dressur – Leser/Ansager', 1, null, 108),
  (date '2026-09-04', '17:00', 'Schreiber & Leser – Dressurplatz', 'M*-Dressur – Schreiber', 1, 'nur Ansage', 109),
  (date '2026-09-04', '17:00', 'Schreiber & Leser – Dressurplatz', 'M*-Dressur – Leser/Ansager', 1, null, 110),
  -- Freitag Halle
  (date '2026-09-04', '14:30', 'Schreiber – Halle', 'Reiter-WB (Schritt-Trab) – Schreiber', 1, null, 201),
  (date '2026-09-04', '16:00', 'Schreiber – Halle', 'Reiter-WB (Schritt-Trab-Galopp) – Schreiber', 1, null, 202),
  (date '2026-09-04', '18:00', 'Schreiber – Halle', 'Stangenparcours – Schreiber', 1, null, 203),
  -- Samstag Dressurplatz
  (date '2026-09-05', '08:45', 'Schreiber & Leser – Dressurplatz', 'M**-Dressurprüfung – Schreiber', 1, 'nur Ansage', 101),
  (date '2026-09-05', '08:45', 'Schreiber & Leser – Dressurplatz', 'M**-Dressurprüfung – Leser/Ansager', 1, null, 102),
  (date '2026-09-05', '11:00', 'Schreiber & Leser – Dressurplatz', 'S*-Dressurprüfung – Schreiber', 3, 'nur Ansage', 103),
  (date '2026-09-05', '11:00', 'Schreiber & Leser – Dressurplatz', 'S*-Dressurprüfung – Leser/Ansager', 1, null, 104),
  (date '2026-09-05', '14:00', 'Schreiber & Leser – Dressurplatz', 'E-Dressur (Nürnberger) – Schreiber', 2, 'Ansage + Aufgabe', 105),
  (date '2026-09-05', '14:00', 'Schreiber & Leser – Dressurplatz', 'E-Dressur (Nürnberger) – Leser/Ansager', 1, null, 106),
  (date '2026-09-05', '15:00', 'Schreiber & Leser – Dressurplatz', 'Dressurprüfung Kl. A* – Schreiber', 2, 'Ansage + Aufgabe', 107),
  (date '2026-09-05', '15:00', 'Schreiber & Leser – Dressurplatz', 'Dressurprüfung Kl. A* – Leser/Ansager', 1, null, 108),
  (date '2026-09-05', '16:30', 'Schreiber & Leser – Dressurplatz', 'L-Dressur – Schreiber', 1, 'Ansage', 109),
  (date '2026-09-05', '16:30', 'Schreiber & Leser – Dressurplatz', 'L-Dressur – Leser/Ansager', 1, null, 110),
  -- Samstag Halle
  (date '2026-09-05', '15:45', 'Schreiber – Halle', 'Führzügel – Schreiber', 1, null, 201),
  -- Sonntag Parcoursdienst
  (date '2026-09-06', '09:00', 'Parcoursdienst', 'E-Springen (60 cm)', 2, null, 301),
  (date '2026-09-06', '10:00', 'Parcoursdienst', 'E-Springen (80 cm)', 2, null, 302),
  (date '2026-09-06', '12:00', 'Parcoursdienst', 'A*-Springen', 2, null, 303),
  (date '2026-09-06', '14:30', 'Parcoursdienst', 'A**-Springen', 2, null, 304),
  (date '2026-09-06', '16:00', 'Parcoursdienst', 'Punkte L', 2, null, 305),
  (date '2026-09-06', '17:15', 'Parcoursdienst', 'Stilspringprüfung Kl. L', 2, null, 306)
) as v(day, time_label, area, title, cap, note, ord);
```

- [ ] **Step 2: Seed im SQL Editor ausführen**

Erwartet: "Success" – Kontrolle: `select count(*) from helfer_shifts;` → 78 Zeilen (48 Getränke/Essen [12 Zeitfenster × 4 Stationen] + 30 Schreiber/Leser/Parcours). Stichprobenartig Inhalte prüfen.

- [ ] **Step 3: Commit**

```bash
git add supabase/002_seed_turnier_2026.sql
git commit -m "feat: Seed-Daten Turnier 2026 aus den Word-Helferlisten"
```

---

### Task 4: Types und Supabase-Client

**Files:**
- Create: `src/types.ts`, `src/lib/supabase.ts`
- Create: `.env.local` (lokal, nicht committen)

- [ ] **Step 1: `src/types.ts`**

```ts
export interface HelferEvent {
  id: string
  name: string
  date_from: string
  date_to: string
  is_active: boolean
  created_at: string
}

export interface Shift {
  id: string
  event_id: string
  day: string
  time_label: string
  area: string
  title: string
  capacity: number
  note: string | null
  sort_order: number
}

export interface Signup {
  id: string
  shift_id: string
  name: string
  phone: string | null
  created_at: string
}
```

- [ ] **Step 2: `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

- [ ] **Step 3: `.env.local` anlegen** (Werte aus dem Supabase-Dashboard → Settings → API der Longier-Planer-Instanz)

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

- [ ] **Step 4: Build prüfen**

```bash
npm run build
```

Erwartet: erfolgreich (TypeScript meldet keine Fehler; `import.meta.env`-Typen kommen aus `src/vite-env.d.ts` des Templates).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/supabase.ts
git commit -m "feat: Datentypen und Supabase-Client"
```

---

### Task 5: Pure Logik – Gruppierung, Status, Fortschritt, Datum (TDD)

**Files:**
- Create: `src/logic/grouping.ts`, `src/logic/grouping.test.ts`

- [ ] **Step 1: Failing Tests schreiben** – `src/logic/grouping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addDays, formatDay, groupByDay, progress, shiftStatus } from './grouping'
import type { Shift, Signup } from '../types'

function mkShift(over: Partial<Shift>): Shift {
  return {
    id: 's1', event_id: 'e1', day: '2026-09-04', time_label: '10:00',
    area: 'Getränke & Essen', title: 'Getränke', capacity: 2, note: null, sort_order: 1,
    ...over,
  }
}
function mkSignup(over: Partial<Signup>): Signup {
  return { id: 'x1', shift_id: 's1', name: 'Anna', phone: null, created_at: '', ...over }
}

describe('shiftStatus', () => {
  it('zählt nur Signups der eigenen Schicht', () => {
    const shift = mkShift({ id: 's1', capacity: 3 })
    const signups = [mkSignup({ id: 'a', shift_id: 's1' }), mkSignup({ id: 'b', shift_id: 'anders' })]
    expect(shiftStatus(shift, signups)).toEqual({ taken: 1, open: 2, full: false })
  })
  it('meldet voll bei Soll-Besetzung erreicht', () => {
    const shift = mkShift({ capacity: 1 })
    expect(shiftStatus(shift, [mkSignup({})])).toEqual({ taken: 1, open: 0, full: true })
  })
})

describe('groupByDay', () => {
  it('gruppiert nach Tag und Bereich in Eingabereihenfolge', () => {
    const shifts = [
      mkShift({ id: 'a', day: '2026-09-04', area: 'Getränke & Essen' }),
      mkShift({ id: 'b', day: '2026-09-04', area: 'Parcoursdienst' }),
      mkShift({ id: 'c', day: '2026-09-05', area: 'Getränke & Essen' }),
      mkShift({ id: 'd', day: '2026-09-04', area: 'Getränke & Essen' }),
    ]
    const days = groupByDay(shifts)
    expect(days.map(d => d.day)).toEqual(['2026-09-04', '2026-09-05'])
    expect(days[0].areas.map(a => a.area)).toEqual(['Getränke & Essen', 'Parcoursdienst'])
    expect(days[0].areas[0].shifts.map(s => s.id)).toEqual(['a', 'd'])
  })
})

describe('progress', () => {
  it('summiert Soll und Ist, überzählige Signups zählen nicht doppelt', () => {
    const shifts = [mkShift({ id: 's1', capacity: 2 }), mkShift({ id: 's2', capacity: 1 })]
    const signups = [
      mkSignup({ id: 'a', shift_id: 's1' }),
      mkSignup({ id: 'b', shift_id: 's2' }),
    ]
    expect(progress(shifts, signups)).toEqual({ taken: 2, total: 3 })
  })
})

describe('formatDay', () => {
  it('formatiert deutsch mit Wochentag', () => {
    expect(formatDay('2026-09-04')).toBe('Freitag, 04.09.')
  })
})

describe('addDays', () => {
  it('verschiebt ISO-Datum um n Tage', () => {
    expect(addDays('2025-09-05', 364)).toBe('2026-09-04')
  })
})
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

```bash
npm test
```

Erwartet: FAIL ("Cannot find module './grouping'" o. ä.).

- [ ] **Step 3: Implementierung** – `src/logic/grouping.ts`:

```ts
import type { Shift, Signup } from '../types'

export interface ShiftStatus {
  taken: number
  open: number
  full: boolean
}

export function shiftStatus(shift: Shift, signups: Signup[]): ShiftStatus {
  const taken = signups.filter(s => s.shift_id === shift.id).length
  const open = Math.max(0, shift.capacity - taken)
  return { taken, open, full: open === 0 }
}

export interface DayGroup {
  day: string
  areas: { area: string; shifts: Shift[] }[]
}

export function groupByDay(shifts: Shift[]): DayGroup[] {
  const days: DayGroup[] = []
  for (const shift of shifts) {
    let d = days.find(x => x.day === shift.day)
    if (!d) {
      d = { day: shift.day, areas: [] }
      days.push(d)
    }
    let a = d.areas.find(x => x.area === shift.area)
    if (!a) {
      a = { area: shift.area, shifts: [] }
      d.areas.push(a)
    }
    a.shifts.push(shift)
  }
  return days
}

export function progress(shifts: Shift[], signups: Signup[]): { taken: number; total: number } {
  let taken = 0
  let total = 0
  for (const shift of shifts) {
    total += shift.capacity
    taken += Math.min(shiftStatus(shift, signups).taken, shift.capacity)
  }
  return { taken, total }
}

export function formatDay(isoDay: string): string {
  const d = new Date(isoDay + 'T00:00:00')
  const weekday = d.toLocaleDateString('de-DE', { weekday: 'long' })
  const dm = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  return `${weekday}, ${dm}`
}

export function addDays(isoDay: string, days: number): string {
  const d = new Date(isoDay + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

```bash
npm test
```

Erwartet: alle Tests PASS. (Falls `formatDay` je nach Node-ICU "04.09." anders formatiert: Erwartungswert an tatsächliches `de-DE`-Ergebnis anpassen, Format-Absicht ist "Freitag, 04.09.".)

- [ ] **Step 5: Commit**

```bash
git add src/logic/grouping.ts src/logic/grouping.test.ts
git commit -m "feat: Gruppierungs- und Statuslogik mit Tests"
```

---

### Task 6: localStorage-Merker für eigene Einträge (TDD)

**Files:**
- Create: `src/logic/storage.ts`, `src/logic/storage.test.ts`

- [ ] **Step 1: Failing Tests** – `src/logic/storage.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetSignup, getMySignupIds, rememberSignup } from './storage'

describe('signup storage', () => {
  beforeEach(() => localStorage.clear())

  it('startet leer', () => {
    expect(getMySignupIds()).toEqual([])
  })

  it('merkt sich IDs und vergisst sie wieder', () => {
    rememberSignup('a')
    rememberSignup('b')
    expect(getMySignupIds()).toEqual(['a', 'b'])
    forgetSignup('a')
    expect(getMySignupIds()).toEqual(['b'])
  })

  it('übersteht kaputte Daten', () => {
    localStorage.setItem('helfer_my_signups', 'kein json')
    expect(getMySignupIds()).toEqual([])
  })
})
```

- [ ] **Step 2: `npm test`** – Erwartet: FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung** – `src/logic/storage.ts`:

```ts
const KEY = 'helfer_my_signups'

export function getMySignupIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function rememberSignup(id: string): void {
  localStorage.setItem(KEY, JSON.stringify([...getMySignupIds(), id]))
}

export function forgetSignup(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(getMySignupIds().filter(x => x !== id)))
}
```

- [ ] **Step 4: `npm test`** – Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logic/storage.ts src/logic/storage.test.ts
git commit -m "feat: localStorage-Merker für eigene Signups"
```

---

### Task 7: Daten-Hook, Routing und öffentliche Ansicht

**Files:**
- Create: `src/hooks/useHelferData.ts`, `src/components/PublicView.tsx`, `src/components/ShiftCard.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: `src/hooks/useHelferData.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { HelferEvent, Shift, Signup } from '../types'

export function useHelferData() {
  const [event, setEvent] = useState<HelferEvent | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [signups, setSignups] = useState<Signup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    const { data: events, error: e1 } = await supabase
      .from('helfer_events').select('*').eq('is_active', true).limit(1)
    if (e1) { setError(e1.message); setLoading(false); return }
    const ev = (events ?? [])[0] ?? null
    setEvent(ev)
    if (!ev) { setShifts([]); setSignups([]); setLoading(false); return }

    const { data: sh, error: e2 } = await supabase
      .from('helfer_shifts').select('*')
      .eq('event_id', ev.id)
      .order('day').order('sort_order')
    if (e2) { setError(e2.message); setLoading(false); return }
    const shiftList = sh ?? []
    setShifts(shiftList)

    if (shiftList.length === 0) { setSignups([]); setLoading(false); return }
    const { data: su, error: e3 } = await supabase
      .from('helfer_signups').select('*')
      .in('shift_id', shiftList.map(s => s.id))
      .order('created_at')
    if (e3) { setError(e3.message); setLoading(false); return }
    setSignups(su ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])
  return { event, shifts, signups, loading, error, reload }
}
```

- [ ] **Step 2: `src/components/ShiftCard.tsx`**

```tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { shiftStatus } from '../logic/grouping'
import { forgetSignup, rememberSignup } from '../logic/storage'
import type { Shift, Signup } from '../types'

interface Props {
  shift: Shift
  signups: Signup[]
  mySignupIds: string[]
  onChanged: () => void
}

export default function ShiftCard({ shift, signups, mySignupIds, onChanged }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const status = shiftStatus(shift, signups)

  async function signUp(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setMessage(null)
    const { data, error } = await supabase.rpc('helfer_signup', {
      p_shift_id: shift.id,
      p_name: name.trim(),
      p_phone: phone.trim() || null,
    })
    setBusy(false)
    if (error) {
      setMessage(error.message.includes('SHIFT_FULL')
        ? 'Diese Schicht ist inzwischen voll besetzt.'
        : 'Eintragen fehlgeschlagen – bitte später erneut versuchen.')
      onChanged()
      return
    }
    rememberSignup(data as string)
    setShowForm(false)
    setName('')
    setPhone('')
    onChanged()
  }

  async function cancel(signupId: string) {
    setBusy(true)
    const { error } = await supabase.rpc('helfer_cancel_signup', { p_signup_id: signupId })
    setBusy(false)
    if (!error) forgetSignup(signupId)
    onChanged()
  }

  return (
    <div className={status.full ? 'shift full' : 'shift open'}>
      <div className="shift-head">
        <strong>{shift.time_label}</strong> – {shift.title}
        {shift.note && <span className="note"> ({shift.note})</span>}
      </div>
      <div className="shift-status">
        {status.full ? '✓ Voll besetzt' : `Noch ${status.open} Helfer gesucht`}
      </div>
      <ul className="names">
        {signups.map(s => (
          <li key={s.id}>
            {s.name}
            {mySignupIds.includes(s.id) && (
              <button className="link" disabled={busy} onClick={() => cancel(s.id)}>
                austragen
              </button>
            )}
          </li>
        ))}
      </ul>
      {!status.full && !showForm && (
        <button className="btn" onClick={() => setShowForm(true)}>Eintragen</button>
      )}
      {showForm && (
        <form onSubmit={signUp} className="signup-form">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name" required />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefon (optional)" />
          <button className="btn" type="submit" disabled={busy}>Eintragen</button>
          <button className="link" type="button" onClick={() => setShowForm(false)}>Abbrechen</button>
        </form>
      )}
      {message && <p className="error">{message}</p>}
    </div>
  )
}
```

- [ ] **Step 3: `src/components/PublicView.tsx`**

```tsx
import { useState } from 'react'
import { useHelferData } from '../hooks/useHelferData'
import { formatDay, groupByDay, progress } from '../logic/grouping'
import { getMySignupIds } from '../logic/storage'
import ShiftCard from './ShiftCard'

export default function PublicView() {
  const { event, shifts, signups, loading, error, reload } = useHelferData()
  const [activeDay, setActiveDay] = useState<string | null>(null)

  if (loading) return <p className="info">Lade Helferliste…</p>
  if (error) return <p className="info error">Fehler beim Laden: {error}</p>
  if (!event) return <p className="info">Aktuell ist keine Helferliste freigeschaltet.</p>

  const days = groupByDay(shifts)
  const day = activeDay ?? days[0]?.day ?? null
  const current = days.find(d => d.day === day)
  const mySignupIds = getMySignupIds()

  return (
    <div className="container">
      <h1>{event.name} – Helferliste</h1>
      <p className="subtitle">
        Trag dich einfach mit deinem Namen in eine Schicht ein. Danke für deine Unterstützung!
      </p>
      <nav className="tabs">
        {days.map(d => {
          const p = progress(d.areas.flatMap(a => a.shifts), signups)
          return (
            <button
              key={d.day}
              className={d.day === day ? 'tab active' : 'tab'}
              onClick={() => setActiveDay(d.day)}
            >
              {formatDay(d.day)}
              <span className="tab-progress">{p.taken} / {p.total} besetzt</span>
            </button>
          )
        })}
      </nav>
      {current?.areas.map(a => (
        <section key={a.area}>
          <h2>{a.area}</h2>
          {a.shifts.map(s => (
            <ShiftCard
              key={s.id}
              shift={s}
              signups={signups.filter(x => x.shift_id === s.id)}
              mySignupIds={mySignupIds}
              onChanged={reload}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: `src/App.tsx` mit Hash-Routing ersetzen**

```tsx
import { useEffect, useState } from 'react'
import PublicView from './components/PublicView'
import PrintView from './components/PrintView'
import AdminView from './components/admin/AdminView'

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const hash = useHashRoute()
  if (hash.startsWith('#/admin')) return <AdminView />
  if (hash.startsWith('#/print')) return <PrintView />
  return <PublicView />
}
```

Damit der Build durchläuft, in diesem Task zwei Platzhalter-Komponenten anlegen (werden in Task 8/9 ersetzt):

`src/components/PrintView.tsx`:

```tsx
export default function PrintView() {
  return <p className="info">Druckansicht folgt.</p>
}
```

`src/components/admin/AdminView.tsx`:

```tsx
export default function AdminView() {
  return <p className="info">Admin-Bereich folgt.</p>
}
```

- [ ] **Step 5: Manuell verifizieren**

```bash
npm run dev
```

Im Browser öffnen (Dev-URL): Tabs Freitag/Samstag/Sonntag mit Fortschritt sichtbar, Seed-Schichten erscheinen gruppiert. Eintragen mit Namen testen → Name erscheint, "Noch X Helfer gesucht" sinkt, bei Erreichen der Soll-Zahl wird die Karte grün und der Button verschwindet. "austragen" beim eigenen Eintrag testen. Mobile Ansicht (DevTools) prüfen.

- [ ] **Step 6: Build + Tests + Commit**

```bash
npm run build
npm test
git add src/
git commit -m "feat: öffentliche Helfer-Ansicht mit Eintragen/Austragen"
```

---

### Task 8: Admin-Bereich

**Files:**
- Modify: `src/components/admin/AdminView.tsx`
- Create: `src/components/admin/AdminLogin.tsx`, `src/components/admin/AdminPanel.tsx`

- [ ] **Step 1: `src/components/admin/AdminView.tsx` ersetzen**

```tsx
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import AdminLogin from './AdminLogin'
import AdminPanel from './AdminPanel'

export default function AdminView() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return <p className="info">Lade…</p>
  if (!session) return <AdminLogin />
  return <AdminPanel />
}
```

- [ ] **Step 2: `src/components/admin/AdminLogin.tsx`**

```tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminLogin() {
  const [email, setEmail] = useState('vorstand@rufv-limbach.de')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError('Anmeldung fehlgeschlagen – E-Mail/Passwort prüfen.')
  }

  return (
    <div className="container">
      <h1>Admin-Anmeldung</h1>
      <form onSubmit={login} className="admin-form">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-Mail" type="email" required />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Passwort" type="password" required />
        <button className="btn" type="submit" disabled={busy}>Anmelden</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}
```

- [ ] **Step 3: `src/components/admin/AdminPanel.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { addDays, formatDay, groupByDay } from '../../logic/grouping'
import type { HelferEvent, Shift, Signup } from '../../types'

const EMPTY_SHIFT = {
  day: '', time_label: '', area: '', title: '', capacity: 1, note: '', sort_order: 0,
}
type ShiftDraft = typeof EMPTY_SHIFT

export default function AdminPanel() {
  const [events, setEvents] = useState<HelferEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [signups, setSignups] = useState<Signup[]>([])
  const [draft, setDraft] = useState<ShiftDraft>(EMPTY_SHIFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase.from('helfer_events').select('*').order('date_from')
    if (error) { setError(error.message); return }
    setEvents(data ?? [])
    if (data && data.length > 0 && !selectedEventId) {
      setSelectedEventId((data.find(e => e.is_active) ?? data[data.length - 1]).id)
    }
  }, [selectedEventId])

  const loadShifts = useCallback(async () => {
    if (!selectedEventId) { setShifts([]); setSignups([]); return }
    const { data: sh, error: e1 } = await supabase
      .from('helfer_shifts').select('*')
      .eq('event_id', selectedEventId).order('day').order('sort_order')
    if (e1) { setError(e1.message); return }
    setShifts(sh ?? [])
    if (!sh || sh.length === 0) { setSignups([]); return }
    const { data: su, error: e2 } = await supabase
      .from('helfer_signups').select('*').in('shift_id', sh.map(s => s.id))
    if (e2) { setError(e2.message); return }
    setSignups(su ?? [])
  }, [selectedEventId])

  useEffect(() => { loadEvents() }, [loadEvents])
  useEffect(() => { loadShifts() }, [loadShifts])

  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null

  async function setActive(eventId: string) {
    setError(null)
    await supabase.from('helfer_events').update({ is_active: false }).eq('is_active', true)
    const { error } = await supabase.from('helfer_events').update({ is_active: true }).eq('id', eventId)
    if (error) setError(error.message)
    loadEvents()
  }

  async function createEvent() {
    const name = prompt('Name des Turniers (z. B. "Turnier 2027"):')
    if (!name) return
    const dateFrom = prompt('Erster Tag (JJJJ-MM-TT):')
    const dateTo = prompt('Letzter Tag (JJJJ-MM-TT):')
    if (!dateFrom || !dateTo) return
    const { error } = await supabase.from('helfer_events')
      .insert({ name, date_from: dateFrom, date_to: dateTo, is_active: false })
    if (error) setError(error.message)
    loadEvents()
  }

  async function copyEvent() {
    if (!selectedEvent) return
    const name = prompt('Name des neuen Turniers:', selectedEvent.name.replace(/\d{4}/, m => String(Number(m) + 1)))
    if (!name) return
    const dateFrom = prompt('Erster Tag des neuen Turniers (JJJJ-MM-TT):')
    if (!dateFrom) return
    const offset = Math.round(
      (new Date(dateFrom + 'T00:00:00').getTime() - new Date(selectedEvent.date_from + 'T00:00:00').getTime()) / 86400000
    )
    const dateTo = addDays(selectedEvent.date_to, offset)
    const { data: ev, error: e1 } = await supabase.from('helfer_events')
      .insert({ name, date_from: dateFrom, date_to: dateTo, is_active: false })
      .select().single()
    if (e1 || !ev) { setError(e1?.message ?? 'Anlegen fehlgeschlagen'); return }
    const copies = shifts.map(({ id: _id, event_id: _e, day, ...rest }) => ({
      ...rest,
      event_id: ev.id,
      day: addDays(day, offset),
    }))
    if (copies.length > 0) {
      const { error: e2 } = await supabase.from('helfer_shifts').insert(copies)
      if (e2) { setError(e2.message); return }
    }
    setSelectedEventId(ev.id)
    loadEvents()
  }

  async function saveShift(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEventId) return
    setError(null)
    const payload = {
      event_id: selectedEventId,
      day: draft.day,
      time_label: draft.time_label,
      area: draft.area,
      title: draft.title,
      capacity: Number(draft.capacity),
      note: draft.note.trim() || null,
      sort_order: Number(draft.sort_order),
    }
    const { error } = editingId
      ? await supabase.from('helfer_shifts').update(payload).eq('id', editingId)
      : await supabase.from('helfer_shifts').insert(payload)
    if (error) { setError(error.message); return }
    setDraft(EMPTY_SHIFT)
    setEditingId(null)
    loadShifts()
  }

  function startEdit(s: Shift) {
    setEditingId(s.id)
    setDraft({
      day: s.day, time_label: s.time_label, area: s.area, title: s.title,
      capacity: s.capacity, note: s.note ?? '', sort_order: s.sort_order,
    })
  }

  async function deleteShift(id: string) {
    if (!confirm('Schicht samt Eintragungen löschen?')) return
    const { error } = await supabase.from('helfer_shifts').delete().eq('id', id)
    if (error) setError(error.message)
    loadShifts()
  }

  async function deleteSignup(id: string) {
    if (!confirm('Diesen Helfer-Eintrag entfernen?')) return
    const { error } = await supabase.from('helfer_signups').delete().eq('id', id)
    if (error) setError(error.message)
    loadShifts()
  }

  return (
    <div className="container">
      <h1>Admin – Helferliste</h1>
      <div className="admin-row">
        <a href="#/">Zur öffentlichen Ansicht</a>
        <a href="#/print">Druckansicht</a>
        <button className="link" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </div>
      {error && <p className="error">{error}</p>}

      <h2>Turnier</h2>
      <div className="admin-row">
        <select value={selectedEventId ?? ''} onChange={e => setSelectedEventId(e.target.value)}>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.name}{ev.is_active ? ' (aktiv)' : ''}
            </option>
          ))}
        </select>
        {selectedEvent && !selectedEvent.is_active && (
          <button className="btn" onClick={() => setActive(selectedEvent.id)}>Aktiv schalten</button>
        )}
        <button className="link" onClick={createEvent}>Neues Turnier</button>
        <button className="link" onClick={copyEvent}>Turnier kopieren</button>
      </div>

      <h2>{editingId ? 'Schicht bearbeiten' : 'Neue Schicht'}</h2>
      <form onSubmit={saveShift} className="admin-form">
        <input type="date" value={draft.day} onChange={e => setDraft({ ...draft, day: e.target.value })} required />
        <input value={draft.time_label} onChange={e => setDraft({ ...draft, time_label: e.target.value })} placeholder="Zeit (z. B. 10:00 – 12:30)" required />
        <input value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })} placeholder="Bereich (z. B. Getränke & Essen)" required />
        <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Aufgabe (z. B. Bonkasse)" required />
        <input type="number" min={1} value={draft.capacity} onChange={e => setDraft({ ...draft, capacity: Number(e.target.value) })} placeholder="Benötigte Helfer" required />
        <input value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="Hinweis (optional)" />
        <input type="number" value={draft.sort_order} onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) })} placeholder="Sortierung" />
        <div className="admin-row">
          <button className="btn" type="submit">{editingId ? 'Speichern' : 'Anlegen'}</button>
          {editingId && (
            <button className="link" type="button" onClick={() => { setEditingId(null); setDraft(EMPTY_SHIFT) }}>
              Abbrechen
            </button>
          )}
        </div>
      </form>

      <h2>Schichten</h2>
      {groupByDay(shifts).map(d => (
        <section key={d.day}>
          <h2>{formatDay(d.day)}</h2>
          {d.areas.map(a => (
            <div key={a.area}>
              <strong>{a.area}</strong>
              {a.shifts.map(s => {
                const su = signups.filter(x => x.shift_id === s.id)
                return (
                  <div key={s.id} className="shift">
                    <div className="shift-head">
                      <strong>{s.time_label}</strong> – {s.title} ({su.length}/{s.capacity})
                      {s.note && <span className="note"> ({s.note})</span>}
                    </div>
                    <ul className="names">
                      {su.map(x => (
                        <li key={x.id}>
                          {x.name}{x.phone ? ` (${x.phone})` : ''}
                          <button className="link" onClick={() => deleteSignup(x.id)}>entfernen</button>
                        </li>
                      ))}
                    </ul>
                    <div className="admin-row">
                      <button className="link" onClick={() => startEdit(s)}>bearbeiten</button>
                      <button className="link" onClick={() => deleteShift(s.id)}>löschen</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Manuell verifizieren**

`npm run dev` → `#/admin` öffnen: Login mit `vorstand@rufv-limbach.de` + Passwort. Prüfen: Schicht anlegen/bearbeiten/löschen, Helfer-Eintrag entfernen, "Turnier kopieren" (neues Turnier mit verschobenen Tagen, ohne Signups), "Aktiv schalten". Abmelden → Login erscheint wieder. In einem privaten Fenster (nicht eingeloggt) per Browser-Konsole prüfen, dass direkte Writes scheitern – bzw. schlicht: öffentliche Ansicht funktioniert weiter normal.

- [ ] **Step 3: Build + Tests + Commit**

```bash
npm run build
npm test
git add src/components/admin/
git commit -m "feat: Admin-Bereich mit Event-/Schichtverwaltung und Turnier-Kopie"
```

---

### Task 9: Druckansicht

**Files:**
- Modify: `src/components/PrintView.tsx` (Platzhalter ersetzen)

- [ ] **Step 1: `src/components/PrintView.tsx` ersetzen**

```tsx
import { useHelferData } from '../hooks/useHelferData'
import { formatDay, groupByDay } from '../logic/grouping'

export default function PrintView() {
  const { event, shifts, signups, loading, error } = useHelferData()

  if (loading) return <p className="info">Lade…</p>
  if (error) return <p className="info error">Fehler: {error}</p>
  if (!event) return <p className="info">Kein aktives Turnier.</p>

  return (
    <div className="print-container">
      <button className="btn no-print" onClick={() => window.print()}>Drucken</button>
      <h1>{event.name} – Helferliste</h1>
      {groupByDay(shifts).map(d => (
        <section key={d.day} className="print-day">
          <h2>{formatDay(d.day)}</h2>
          {d.areas.map(a => (
            <div key={a.area}>
              <h3>{a.area}</h3>
              <table>
                <thead>
                  <tr><th>Zeit</th><th>Aufgabe</th><th>Helfer</th></tr>
                </thead>
                <tbody>
                  {a.shifts.map(s => {
                    const names = signups.filter(x => x.shift_id === s.id).map(x => x.name)
                    while (names.length < s.capacity) names.push('____________')
                    return (
                      <tr key={s.id}>
                        <td>{s.time_label}</td>
                        <td>{s.title}{s.note ? ` (${s.note})` : ''}</td>
                        <td>{names.join(', ')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Manuell verifizieren**

`#/print` öffnen: alle Tage/Bereiche als Tabellen, unbesetzte Plätze als Linien. Druckvorschau (Strg+P): "Drucken"-Button ausgeblendet, Seitenumbrüche brauchbar.

- [ ] **Step 3: Build + Commit**

```bash
npm run build
git add src/components/PrintView.tsx
git commit -m "feat: Druckansicht als Papier-Backup"
```

---

### Task 10: GitHub-Repo und Deployment

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1: Workflow** – `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: `README.md`**

```markdown
# Helferliste RuFV Limbach

Online-Helferliste für das jährliche Reitturnier. Mitglieder tragen sich ohne Login
in Schichten ein; der Vorstand pflegt Schichten unter `#/admin`.

- Öffentliche Ansicht: `https://lscheidh.github.io/helferliste/`
- Admin: `…/#/admin` (gemeinsamer Vorstands-Account)
- Druckansicht: `…/#/print`

## Entwicklung

`npm install`, `.env.local` mit `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` anlegen,
dann `npm run dev`. Tests: `npm test`.

## Datenbank

Supabase (geteilte Instanz mit dem Longier-Planer, eigene `helfer_*`-Tabellen).
Schema: `supabase/001_schema.sql`, Startdaten: `supabase/002_seed_turnier_2026.sql`.
Neues Jahr: im Admin "Turnier kopieren" und aktiv schalten.
```

- [ ] **Step 3: Repo anlegen und pushen**

```bash
git add .github README.md
git commit -m "chore: GitHub-Pages-Deployment und README"
git branch -M main
gh repo create lscheidh/helferliste --public --source . --push
gh secret set VITE_SUPABASE_URL --body "<url>"
gh secret set VITE_SUPABASE_ANON_KEY --body "<anon-key>"
```

Dann im Repo: Settings → Pages → Source "GitHub Actions". Workflow ggf. per `gh workflow run deploy.yml` erneut anstoßen.

- [ ] **Step 4: Live verifizieren**

`https://lscheidh.github.io/helferliste/` öffnen: Liste lädt, Eintragen funktioniert, `#/admin` und `#/print` erreichbar. Am Handy testen.

---

## Abschluss-Check (manueller E2E-Durchlauf vor Go-Live)

- [ ] Eintragen bis zur Soll-Besetzung → Schicht wird grün, Button verschwindet.
- [ ] Zwei Browser gleichzeitig auf letzten Platz → einer bekommt "voll besetzt".
- [ ] Austragen am selben Gerät funktioniert; Admin kann fremde Einträge entfernen.
- [ ] Admin: Schicht-CRUD, Turnier kopieren, aktiv schalten.
- [ ] Druckansicht in der Druckvorschau brauchbar.
- [ ] URL + QR-Code für den Aushang erzeugen (QR z. B. über beliebigen Generator, Ausdruck neben die Papierliste).
