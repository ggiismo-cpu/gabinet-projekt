-- ============================================================
--  Gabinet MM — System Zgód : schema Supabase
--  Wersja: 1.0  |  2026-04-21
--  Autor:  generowane dla: system_zgod_v5_4.html
-- ============================================================
--
--  JAK UŻYĆ:
--  1. Zaloguj się do panelu Supabase: https://supabase.com/dashboard
--  2. Wybierz swój projekt → "SQL Editor" → "New query"
--  3. Wklej CAŁY ten plik i kliknij "RUN"
--  4. Na końcu uruchom bloki WERYFIKACJA (dolna sekcja), aby potwierdzić
--     że polityki RLS są aktywne.
--
--  UWAGA ws. nazw kolumn:
--  -------------------------------------------------------------
--  Nazwy kolumn są DOKŁADNIE takie jak klucze JSON wysyłane przez
--  funkcję supaUpsert() w pliku HTML (camelCase: "createdAt",
--  "clientId", "photoBefore" itd.). Dzięki temu istniejący kod
--  JS działa bez żadnych zmian. Kolumny pisane camelCase muszą
--  być w SQL cytowane w cudzysłowach ("createdAt").
--
--  Kontrakt synchronizacji:
--  -------------------------------------------------------------
--  IndexedDB (lokalnie, int autoIncrement id)  -->  Supabase
--    local_id  = lokalne id z IndexedDB (int)
--    user_id   = auth.users.id (uuid) — ustawiane przez supaUpsert
--    id        = własny uuid po stronie serwera
--    UNIQUE(local_id, user_id) — używane w onConflict przy upsert
--
--  RLS:
--  -------------------------------------------------------------
--  Każdy użytkownik widzi i modyfikuje wyłącznie SWOJE wiersze
--  (user_id = auth.uid()). SELECT/INSERT/UPDATE/DELETE mają
--  osobne polityki.
-- ============================================================

create extension if not exists "pgcrypto";

-- =========================================================
--  TABELA: clients  (baza klientów)
-- =========================================================
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  local_id     bigint not null,                       -- IndexedDB autoIncrement
  name         text not null,
  phone        text,
  email        text,
  address      text,
  dob          text,                                  -- YYYY-MM-DD (dopuszczamy text — PESEL też wystarczy)
  pesel        text,
  "createdAt"  timestamptz default now(),
  "updatedAt"  timestamptz default now(),
  constraint clients_local_user_uk unique (local_id, user_id)
);

create index if not exists clients_user_idx        on public.clients(user_id);
create index if not exists clients_user_name_idx   on public.clients(user_id, lower(name));
create index if not exists clients_user_phone_idx  on public.clients(user_id, phone);

alter table public.clients enable row level security;

drop policy if exists "clients_select_own" on public.clients;
create policy "clients_select_own" on public.clients
  for select using (auth.uid() = user_id);

drop policy if exists "clients_insert_own" on public.clients;
create policy "clients_insert_own" on public.clients
  for insert with check (auth.uid() = user_id);

drop policy if exists "clients_update_own" on public.clients;
create policy "clients_update_own" on public.clients
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "clients_delete_own" on public.clients;
create policy "clients_delete_own" on public.clients
  for delete using (auth.uid() = user_id);


-- =========================================================
--  TABELA: consents  (zgody + dane zabiegowe + zdjęcia)
-- =========================================================
-- UWAGA: sig1, photoBefore, photoAfter przechowują base64 data-URL.
-- Pojedynczy wiersz może mieć ~1–2 MB. PostgreSQL (TOAST) obsługuje
-- to transparentnie, ale przy ~1000 zgód licz się z ~1–2 GB zajętości.
-- Produkcyjnie warto rozważyć migrację zdjęć do Supabase Storage
-- (osobny bucket + RLS) — to zostawione na później.
--
create table if not exists public.consents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  local_id         bigint not null,
  "clientId"       bigint,                             -- lokalne id klienta (łączone przez (clientId,user_id) = clients.local_id,clients.user_id)
  "treatmentId"    text,                               -- id z tablicy T[] np. 'rf_mikroiglowy'
  "treatmentName"  text,
  duration         text,                               -- dopuszczamy text (np. "40-60 min")
  date             text,                               -- YYYY-MM-DD
  checks           jsonb,                              -- {"pytanie":"TAK"|"NIE", ...}
  subtypes         jsonb,                              -- ["podtyp1","podtyp2"]
  extras           jsonb,                              -- [{"label":"...","value":"..."}]
  rodo             boolean,
  "wizDok"         boolean,
  "wizSzk"         boolean,
  "wizMar"         boolean,
  sig1             text,                               -- base64 PNG (data URL) — podpis klienta
  "legalStamp"     jsonb,                              -- {"ts":"...","ua":"...","scr":"...","hash":"..."}
  params           text,                               -- parametry zabiegu (wpisywane po zabiegu)
  notes            text,
  "photoBefore"    text,                               -- base64 JPEG (data URL)
  "photoAfter"     text,
  "cosmoTs"        timestamptz,
  "createdAt"      timestamptz default now(),
  constraint consents_local_user_uk unique (local_id, user_id)
);

create index if not exists consents_user_idx          on public.consents(user_id);
create index if not exists consents_user_client_idx   on public.consents(user_id, "clientId");
create index if not exists consents_user_date_idx     on public.consents(user_id, date desc);

alter table public.consents enable row level security;

drop policy if exists "consents_select_own" on public.consents;
create policy "consents_select_own" on public.consents
  for select using (auth.uid() = user_id);

drop policy if exists "consents_insert_own" on public.consents;
create policy "consents_insert_own" on public.consents
  for insert with check (auth.uid() = user_id);

drop policy if exists "consents_update_own" on public.consents;
create policy "consents_update_own" on public.consents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "consents_delete_own" on public.consents;
create policy "consents_delete_own" on public.consents
  for delete using (auth.uid() = user_id);


-- =========================================================
--  TABELA: appointments  (wizyty / kalendarz)
-- =========================================================
create table if not exists public.appointments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  local_id         bigint not null,
  "clientId"       bigint,                             -- lokalne id klienta
  date             text not null,                      -- YYYY-MM-DD
  time             text not null,                      -- HH:MM
  treatment        text,
  price            text,                               -- uwaga: w menu cena bywa tekstowa np. "od 150"
  duration         integer,                            -- minuty
  "rescheduledAt"  timestamptz,
  "previousDate"   text,
  "previousTime"   text,
  "createdAt"      timestamptz default now(),
  constraint appointments_local_user_uk unique (local_id, user_id)
);

create index if not exists appointments_user_idx          on public.appointments(user_id);
create index if not exists appointments_user_date_idx     on public.appointments(user_id, date);
create index if not exists appointments_user_client_idx   on public.appointments(user_id, "clientId");

alter table public.appointments enable row level security;

drop policy if exists "appointments_select_own" on public.appointments;
create policy "appointments_select_own" on public.appointments
  for select using (auth.uid() = user_id);

drop policy if exists "appointments_insert_own" on public.appointments;
create policy "appointments_insert_own" on public.appointments
  for insert with check (auth.uid() = user_id);

drop policy if exists "appointments_update_own" on public.appointments;
create policy "appointments_update_own" on public.appointments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "appointments_delete_own" on public.appointments;
create policy "appointments_delete_own" on public.appointments
  for delete using (auth.uid() = user_id);


-- =========================================================
--  TRIGGER: auto-update "updatedAt" dla clients
-- =========================================================
create or replace function public.clients_set_updated_at()
returns trigger language plpgsql as $$
begin
  new."updatedAt" = now();
  return new;
end $$;

drop trigger if exists clients_set_updated_at_trg on public.clients;
create trigger clients_set_updated_at_trg
  before update on public.clients
  for each row execute function public.clients_set_updated_at();


-- =========================================================
--  WERYFIKACJA — uruchom po instalacji, aby sprawdzić że wszystko gra
-- =========================================================
-- 1) Czy tabele istnieją:
--    select table_name from information_schema.tables
--    where table_schema='public' and table_name in ('clients','consents','appointments');
--
-- 2) Czy RLS jest włączone:
--    select relname, relrowsecurity from pg_class
--    where relname in ('clients','consents','appointments');
--    -- relrowsecurity powinno być 't' (true) dla wszystkich trzech
--
-- 3) Czy polityki istnieją (powinno być 12: 4 × 3 tabele):
--    select schemaname, tablename, policyname, cmd
--    from pg_policies where schemaname='public'
--    order by tablename, cmd;
--
-- 4) Czy unique constraint działa:
--    select conname, contype from pg_constraint
--    where conrelid in ('public.clients'::regclass,
--                       'public.consents'::regclass,
--                       'public.appointments'::regclass)
--      and contype='u';
-- =========================================================

-- === KONIEC ===
