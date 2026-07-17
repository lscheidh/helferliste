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
