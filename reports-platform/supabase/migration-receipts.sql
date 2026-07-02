-- =============================================================
-- Migración: acuse de recibo de reportes ("Recibido / Visto bueno")
-- Ejecutar en Supabase SQL Editor. Idempotente.
-- =============================================================

create table if not exists public.report_receipts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(report_id, user_id)
);

create index if not exists idx_receipts_report on public.report_receipts(report_id);
create index if not exists idx_receipts_user on public.report_receipts(user_id);
