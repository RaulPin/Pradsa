-- =============================================================
-- Bastión — SGSI ISO/IEC 27001:2022
-- Esquema PostgreSQL multi-tenant para Supabase
-- =============================================================
-- Modelo de aislamiento:
--   * La app usa la service_role key y filtra SIEMPRE por org_id
--     (obtenido de la sesión JWT). Ver src/lib/session.ts.
--   * Se habilita RLS como defensa en profundidad; las políticas
--     por defecto niegan todo salvo a la service_role.
-- =============================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- Organizaciones (tenants)
-- -------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,          -- pradsa, nortech, ...
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Usuarios (identidad global; pueden pertenecer a varias orgs)
-- -------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  password_hash text not null,
  must_change_password boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on public.users(email);

-- -------------------------------------------------------------
-- Membresías usuario <-> organización, con rol dentro de la org
--   OWNER    - Responsable del SGSI (administra la organización)
--   MANAGER  - Edita activos, riesgos, SoA, evidencias
--   AUDITOR  - Solo lectura (auditor interno/externo)
-- -------------------------------------------------------------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('OWNER','MANAGER','AUDITOR')),
  created_at timestamptz not null default now(),
  unique(user_id, org_id)
);

create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_org on public.memberships(org_id);

-- -------------------------------------------------------------
-- Códigos OTP (envío al correo)
-- -------------------------------------------------------------
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_otp_email on public.otp_codes(email);

-- -------------------------------------------------------------
-- Registro de auditoría (trazabilidad — A.8.15 / A.8.16)
-- -------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  email text,
  action text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_org on public.audit_logs(org_id);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- -------------------------------------------------------------
-- Catálogo GLOBAL de controles del Anexo A (ISO 27001:2022)
-- Compartido por todas las organizaciones (org_id = null).
-- -------------------------------------------------------------
create table if not exists public.controls (
  ref text primary key,               -- A.5.9, A.8.24, ...
  theme text not null check (theme in ('A5','A6','A7','A8')),
  ordinal int not null,               -- para ordenar dentro del tema
  title text not null
);

-- -------------------------------------------------------------
-- Inventario de activos (A.5.9 / A.5.12)
-- Clasificación C-I-D en escala 1..3 (1 bajo, 2 medio, 3 alto)
-- -------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,                 -- ACT-001 (único por organización)
  name text not null,
  description text,
  type text not null check (type in ('INFORMATION','SOFTWARE','HARDWARE','SERVICE','PEOPLE','FACILITY')),
  owner_name text,
  location text,
  confidentiality int not null default 2 check (confidentiality between 1 and 3),
  integrity int not null default 2 check (integrity between 1 and 3),
  availability int not null default 2 check (availability between 1 and 3),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, code)
);

create index if not exists idx_assets_org on public.assets(org_id);

-- -------------------------------------------------------------
-- Registro de riesgos (Cláusula 6.1 / 8.2 / 8.3)
-- Probabilidad e impacto en escala 1..5. Puntaje = prob * impacto.
-- -------------------------------------------------------------
create table if not exists public.risks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,                 -- R-001 (único por organización)
  title text not null,
  description text,
  asset_id uuid references public.assets(id) on delete set null,
  threat text,
  vulnerability text,
  likelihood int not null default 3 check (likelihood between 1 and 5),
  impact int not null default 3 check (impact between 1 and 5),
  treatment text not null default 'MITIGATE' check (treatment in ('MITIGATE','ACCEPT','TRANSFER','AVOID')),
  residual_likelihood int check (residual_likelihood between 1 and 5),
  residual_impact int check (residual_impact between 1 and 5),
  owner_name text,
  status text not null default 'OPEN' check (status in ('OPEN','TREATING','ACCEPTED','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, code)
);

create index if not exists idx_risks_org on public.risks(org_id);
create index if not exists idx_risks_asset on public.risks(asset_id);

-- -------------------------------------------------------------
-- Declaración de Aplicabilidad (SoA) — Cláusula 6.1.3
-- Una fila por control del Anexo A y por organización.
-- Se siembra al crear la organización (ver seed-org.mjs).
-- -------------------------------------------------------------
create table if not exists public.soa_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  control_ref text not null references public.controls(ref),
  applicable boolean not null default true,
  status text not null default 'PLANNED'
    check (status in ('IMPLEMENTED','IN_PROGRESS','PLANNED','NOT_APPLICABLE')),
  justification text,                 -- razón de inclusión/exclusión
  owner_name text,
  notes text,
  updated_at timestamptz not null default now(),
  unique(org_id, control_ref)
);

create index if not exists idx_soa_org on public.soa_entries(org_id);

-- -------------------------------------------------------------
-- RLS (defensa en profundidad). La app opera con service_role,
-- que omite RLS; estas políticas bloquean el acceso anónimo directo.
-- -------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.users           enable row level security;
alter table public.memberships     enable row level security;
alter table public.assets          enable row level security;
alter table public.risks           enable row level security;
alter table public.soa_entries     enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.otp_codes       enable row level security;
-- (sin políticas permisivas: solo service_role puede leer/escribir)
