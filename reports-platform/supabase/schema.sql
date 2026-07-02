-- =============================================================
-- Pradsa - Plataforma de Reportes
-- Schema PostgreSQL para Supabase
-- =============================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- Perfiles de usuario
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  password_hash text not null,
  role text not null check (role in ('SUPER_ADMIN','UPLOADER','CLIENT_FULL','CLIENT_BANCA','CLIENT_FOLDER')),
  must_change_password boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles(email);

-- -------------------------------------------------------------
-- Códigos OTP (envío al correo)
-- -------------------------------------------------------------
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_otp_email on public.otp_codes(email);

-- -------------------------------------------------------------
-- Bancas (Banca PyMe, Sucursales, y futuras)
-- Nivel superior que agrupa las carpetas y aísla los clientes
-- entre una banca y otra.
-- -------------------------------------------------------------
create table if not exists public.bancas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,        -- PYME, SUCURSALES, ...
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.bancas (code, name)
values ('PYME', 'Banca PyMe'), ('SUCURSALES', 'Sucursales')
on conflict (code) do nothing;

-- -------------------------------------------------------------
-- Carpetas / regiones (hasta 64+ por banca)
-- -------------------------------------------------------------
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  region_code text,
  banca_id uuid references public.bancas(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_folders_region on public.folders(region_code);
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
-- Permisos usuario <-> carpeta (para CLIENT_FOLDER)
-- -------------------------------------------------------------
create table if not exists public.user_folder_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, folder_id)
);

-- -------------------------------------------------------------
-- Reportes (archivos PDF)
-- -------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size integer,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists idx_reports_folder on public.reports(folder_id);

-- -------------------------------------------------------------
-- Acuse de recibo de reportes ("Recibido / Visto bueno" del cliente)
-- -------------------------------------------------------------
create table if not exists public.report_receipts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(report_id, user_id)
);

create index if not exists idx_receipts_report on public.report_receipts(report_id);
create index if not exists idx_receipts_user on public.report_receipts(user_id);

-- -------------------------------------------------------------
-- Registro de auditoría (logins, descargas, cargas, etc.)
-- -------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  action text not null,  -- LOGIN, LOGOUT, DOWNLOAD, UPLOAD, OTP_REQUESTED, OTP_VERIFIED, PASSWORD_CHANGED, LOGIN_FAILED
  resource_type text,    -- REPORT, FOLDER, USER
  resource_id uuid,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_user on public.audit_logs(user_id);
create index if not exists idx_audit_action on public.audit_logs(action);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- -------------------------------------------------------------
-- Storage bucket (privado) para los PDF
-- Ejecutar en el panel de Supabase o vía API:
--   insert into storage.buckets (id, name, public) values ('reports','reports', false);
-- -------------------------------------------------------------

-- -------------------------------------------------------------
-- Usuario administrador inicial (CAMBIAR EMAIL Y HASH)
-- El password_hash corresponde a un bcrypt; genera el tuyo.
-- Contraseña temporal de ejemplo: Pradsa#2026 (debe cambiarse al primer ingreso)
-- -------------------------------------------------------------
-- insert into public.profiles (email, full_name, password_hash, role, must_change_password)
-- values ('raulpineda.0197@gmail.com', 'Administrador General', '<bcrypt_hash>', 'SUPER_ADMIN', true);
