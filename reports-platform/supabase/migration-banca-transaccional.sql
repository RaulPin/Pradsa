-- =============================================================
-- Migración: banca "Transaccional"
-- Ejecutar en Supabase SQL Editor. Idempotente.
-- =============================================================

insert into public.bancas (code, name)
values ('TRANSACCIONAL', 'Transaccional')
on conflict (code) do nothing;
