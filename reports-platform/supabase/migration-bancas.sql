-- =============================================================
-- Migración: nivel "Banca" (aislamiento entre bancas)
-- Ejecutar en Supabase SQL Editor sobre una base ya creada.
-- Es idempotente: se puede correr varias veces sin romper nada.
-- =============================================================

-- -------------------------------------------------------------
-- Bancas (Banca PyMe, Sucursales, y futuras)
-- -------------------------------------------------------------
create table if not exists public.bancas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,        -- PYME, SUCURSALES, ...
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Bancas iniciales
insert into public.bancas (code, name)
values ('PYME', 'Banca PyMe'), ('SUCURSALES', 'Sucursales')
on conflict (code) do nothing;

-- -------------------------------------------------------------
-- Vínculo carpeta -> banca
-- -------------------------------------------------------------
alter table public.folders
  add column if not exists banca_id uuid references public.bancas(id);

create index if not exists idx_folders_banca on public.folders(banca_id);

-- -------------------------------------------------------------
-- Permisos usuario <-> banca (rol Administrativo de Banca)
-- Ve TODAS las carpetas de su(s) banca(s) automáticamente.
-- -------------------------------------------------------------
create table if not exists public.user_banca_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  banca_id uuid references public.bancas(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, banca_id)
);

-- -------------------------------------------------------------
-- Nuevo rol CLIENT_BANCA en el check de profiles
-- -------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('SUPER_ADMIN','UPLOADER','CLIENT_FULL','CLIENT_BANCA','CLIENT_FOLDER'));
