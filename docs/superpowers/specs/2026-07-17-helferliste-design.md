# Design: Helferlisten-App RuFV Limbach

**Datum:** 2026-07-17
**Status:** Vom Nutzer freigegeben (Variante A)

## Zweck

Digitalisierung der bisherigen Papier-Helferlisten (Aushang) für das jährliche Reitturnier des RuFV Limbach. Vereinsmitglieder tragen sich online in Schichten ein; der Vorstand pflegt die Schichtstruktur über eine einfache Admin-Oberfläche. Vorlage sind die Word-Listen aus `RuFV Limbach\Turniere\Turnier 2026\Helferlisten`:

- **Getränke/Essen:** Raster aus Zeitfenstern (Fr/Sa/So) × Stationen (Getränke, Kuchen/belegte Brötchen, Warme Speisen, Bonkasse) mit Personenbedarf pro Zelle.
- **Schreiber/Leser:** Liste einzelner Prüfungen (Uhrzeit, Platz/Halle) mit Rollen (Schreiber, Leser/Ansager) und Personenbedarf; Sonntag zusätzlich Parcoursdienst.

Beide Listen folgen demselben Muster: **Schicht = Zeitraum/Ereignis + Aufgabe + benötigte Personenzahl.**

## Entscheidungen (mit Nutzer abgestimmt)

- Maßgeschneiderte Webseite, kein fertiges Tool.
- Helfer tragen sich **ohne Login** ein (nur Name, optional Telefon).
- **Einfache Admin-Oberfläche** mit einem gemeinsamen Vorstands-Passwort.
- Tech-Stack wie Longier-Planer: React + Vite + TypeScript, Supabase, GitHub Pages.
- **Supabase:** Integration in die bestehende Longier-Planer-Instanz (Free Tier erlaubt nur 2 Projekte). Eigene Tabellen mit Präfix, strikte RLS-Trennung.
- **Kapazität ist Soll-Besetzung**, nicht Maximum: Eine Schicht mit 3 Plätzen gilt erst mit 3 Eintragungen als besetzt; offene Bedarfe werden aktiv hervorgehoben.
- Austragen: selbst nur am gleichen Gerät (localStorage-Merker), sonst über den Admin.
- Projektort: `C:\Users\Admin\OneDrive\RuFV Limbach\App-Entwicklung\helferliste`, eigenes GitHub-Repo unter `lscheidh`.

## Datenmodell (Supabase)

Drei Tabellen in der Longier-Planer-Instanz, Präfix `helfer_`:

### `helfer_events`
| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | z. B. "Turnier 2026" |
| `date_from`, `date_to` | date | Turnierzeitraum |
| `is_active` | boolean | genau ein aktives Event wird öffentlich angezeigt |
| `created_at` | timestamptz | |

### `helfer_shifts`
| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | uuid PK | |
| `event_id` | uuid FK → helfer_events | |
| `day` | date | Turniertag |
| `time_label` | text | z. B. "10:00 – 12:30" oder "11:15" |
| `area` | text | Gruppierung, z. B. "Getränke & Essen", "Schreiber/Leser Dressurplatz", "Parcoursdienst" |
| `title` | text | z. B. "Kuchen/belegte Brötchen" oder "Dressurpferde A" |
| `capacity` | int | **Soll-Besetzung** (benötigte Personenzahl) |
| `note` | text nullable | z. B. "Ansage + Aufgabe", "nur Ausgabe" |
| `sort_order` | int | Reihenfolge innerhalb des Tages |

### `helfer_signups`
| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | uuid PK | |
| `shift_id` | uuid FK → helfer_shifts (on delete cascade) | |
| `name` | text | Pflichtfeld |
| `phone` | text nullable | für Rückfragen |
| `created_at` | timestamptz | |

### Überbesetzungsschutz

Eintragen läuft ausschließlich über eine Postgres-Funktion (RPC) `helfer_signup(shift_id, name, phone)`, die in einer Transaktion die aktuelle Belegung gegen `capacity` prüft und den Eintrag anlegt. Zwei gleichzeitige Anmeldungen auf den letzten Platz können nicht beide durchkommen; die zweite erhält die Fehlermeldung "Schicht ist bereits voll besetzt". Die Funktion gibt die Signup-ID zurück (wird im localStorage gespeichert für das Austragen).

Austragen läuft über eine RPC `helfer_cancel_signup(signup_id)` (löscht nur den eigenen, per ID bekannten Eintrag).

### RLS-Policies

- `helfer_*`-Tabellen: **SELECT öffentlich** (anon), **INSERT/DELETE auf signups nur über die RPCs** (SECURITY DEFINER, direkte Tabellen-Writes für anon gesperrt).
- INSERT/UPDATE/DELETE auf `helfer_events` und `helfer_shifts` sowie DELETE beliebiger Signups: nur für den Admin-Auth-Nutzer (z. B. `vorstand@rufv-limbach.de`).
- Der Admin-Nutzer erhält **keinerlei Rechte** auf die Longier-Planer-Tabelle `bookings`; deren bestehende Policies bleiben unangetastet.
- Alle Abfragen der App filtern auf das aktive Event (Lehre aus dem Longier-Planer-Bug: PostgREST-1000-Zeilen-Limit nie ungefiltert treffen).

## Öffentliche Helfer-Ansicht (ohne Login)

- Eine URL, teilbar per WhatsApp/E-Mail/QR-Code am Aushang.
- Tabs pro Turniertag (Freitag/Samstag/Sonntag), darunter Abschnitte pro `area`.
- Jede Schicht zeigt: Zeit, Aufgabe, Hinweis, Belegungsstatus und die eingetragenen Vornamen (wie auf dem Papieraushang, damit man sieht, mit wem man Schicht hat).
- **Soll-Besetzungs-Darstellung:** unvollständig besetzte Schichten werden hervorgehoben (orange) mit "Noch X Helfer gesucht"; voll besetzte erscheinen grün/abgehakt und sind gesperrt.
- Fortschrittsanzeige pro Tag (z. B. "Samstag: 14 von 20 Plätzen besetzt").
- "Eintragen"-Button → Formular (Name Pflicht, Telefon optional) → RPC → sofortige Aktualisierung.
- **Austragen:** Die eigene Signup-ID liegt im localStorage; der eigene Eintrag zeigt einen "Austragen"-Button. Bei Gerätewechsel entfernt der Admin den Eintrag.
- Mobil-optimiert (primäre Nutzung am Handy).

## Admin-Bereich

- Route `/admin`, Login über Supabase-Auth mit einem gemeinsamen Vorstands-Account.
- Funktionen:
  - Turnier (Event) anlegen/bearbeiten, aktives Event setzen.
  - Schichten anlegen/bearbeiten/löschen (Formular: Tag, Zeit, Bereich, Titel, Soll-Besetzung, Hinweis, Reihenfolge).
  - Beliebige Helfer-Einträge entfernen.
  - **"Turnier kopieren":** übernimmt alle Schichten eines Vorjahres-Events als Startpunkt (ohne Signups); danach nur Zeiten/Prüfungen anpassen.
  - **Druckansicht:** druckfreundliche Gesamtliste aller Schichten mit Namen (Papier-Backup für das Turnierwochenende).

## Technik & Deployment

- React + Vite + TypeScript, Projektstruktur analog Longier-Planer.
- Supabase: bestehende Longier-Planer-Instanz, nur neue `helfer_*`-Objekte.
- Eigenes GitHub-Repo unter `lscheidh`, Deployment via GitHub Actions auf GitHub Pages; zunächst github.io-URL, Domain optional später.
- Hinweis: Beide Apps teilen sich die Free-Tier-Limits der Supabase-Instanz; bei den erwarteten Datenmengen (wenige hundert Zeilen/Jahr) unkritisch.

## Bewusst nicht enthalten (YAGNI)

Keine E-Mail-Erinnerungen, keine Push-Benachrichtigungen, keine Mitgliederverwaltung, kein Schichttausch, keine Warteliste. Nachrüstbar, falls sich Bedarf zeigt.

## Testing

- Kernlogik (Belegungsberechnung, Soll/Ist-Status, Gruppierung nach Tag/Bereich) als reine Funktionen mit Unit-Tests (Vitest).
- RPC-Verhalten (voll besetzte Schicht lehnt ab) wird gegen die Supabase-Instanz manuell verifiziert; das Race-Condition-Verhalten sichert die DB-Transaktion, nicht der Client.
- Manueller Ende-zu-Ende-Durchlauf vor dem Go-Live: Eintragen, Austragen, Admin-CRUD, Druckansicht, Mobilansicht.
