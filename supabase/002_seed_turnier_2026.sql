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
