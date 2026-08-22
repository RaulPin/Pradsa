# Bastión

Plataforma **SaaS multiempresa** para gestionar un **Sistema de Gestión de Seguridad de la Información (SGSI)** conforme a **ISO/IEC 27001:2022**. Cada organización (tenant) opera en su propio espacio aislado.

> Producto derivado de la experiencia de Pradsa: reutiliza sus patrones probados de autenticación OTP, control de acceso por roles y bitácora auditable, ahora rediseñados como multi-tenant.

## Fase 1 — la columna vertebral del SGSI

| Módulo | Descripción | Referencia ISO |
|---|---|---|
| **Panel** | Preparación de la SoA, riesgos abiertos, mapa de calor y avance por tema | — |
| **Inventario de activos** | Activos con propietario y clasificación C‑I‑D (1–3) | A.5.9 · A.5.12 |
| **Registro de riesgos** | Probabilidad × impacto, riesgo inherente/residual, tratamiento | Cláusula 6.1 |
| **Declaración de Aplicabilidad (SoA)** | Los 93 controles del Anexo A 2022, estado y justificación | Cláusula 6.1.3 |
| **Bitácora** | Registro auditable de acciones (quién, qué, cuándo, desde dónde) | A.8.15 |

## Arquitectura

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**.
- **Supabase (PostgreSQL)** como base de datos.
- **Autenticación propia**: contraseña (bcrypt) + **OTP de un solo uso** por correo + sesión **JWT HS256** en cookie httpOnly.
- **Multi-tenant**: un usuario puede pertenecer a varias organizaciones vía `memberships` con un rol por organización. La organización activa viaja en el token; el selector de la cabecera reemite la sesión.
- **Aislamiento**: la aplicación filtra **siempre** por `org_id` de la sesión. RLS habilitado como defensa en profundidad (la app opera con `service_role`).

### Roles por organización

| Rol | Puede |
|---|---|
| `OWNER` — Responsable del SGSI | Todo dentro de su organización |
| `MANAGER` — Gestor | Crear/editar activos, riesgos y SoA |
| `AUDITOR` | Solo lectura |

## Puesta en marcha

1. Instala dependencias:
   ```bash
   npm install
   ```
2. Copia `.env.example` a `.env` y complétalo (Supabase URL, `service_role`, `SESSION_SECRET`, opcionalmente Resend).
3. En el editor SQL de Supabase, ejecuta en orden:
   ```
   supabase/schema.sql
   supabase/seed-annex-a.sql
   ```
4. Crea tu primera organización con su responsable (siembra automáticamente las 93 entradas de la SoA):
   ```bash
   npm run seed:org -- pradsa "Grupo Pradsa" responsable@pradsa.com "Contraseña#2026"
   ```
5. Arranca:
   ```bash
   npm run dev
   ```
   La app queda en `http://localhost:3000`. En desarrollo, si no configuras Resend, el **código OTP se imprime en la consola** del servidor.

## Estructura

```
bastion/
├── supabase/
│   ├── schema.sql          # tablas multi-tenant + RLS
│   └── seed-annex-a.sql    # catálogo de los 93 controles del Anexo A
├── scripts/
│   └── seed-org.mjs        # crea organización + responsable + SoA
└── src/
    ├── app/
    │   ├── (auth)/         # login + verificación OTP
    │   ├── (app)/          # panel, activos, riesgos, soa, bitácora
    │   └── api/            # rutas de autenticación y de datos
    ├── components/         # ui, layout y módulos
    ├── lib/                # auth, sesión, auditoría, correo, riesgo
    └── types/              # tipos del dominio
```

## Hoja de ruta

- **Fase 1 (esta entrega):** multiempresa, activos, riesgos, SoA, bitácora.
- **Fase 2 — operación:** incidentes de seguridad, no conformidades / CAPA, control documental de políticas, indicadores.
- **Fase 3 — certificación:** auditorías internas, proveedores, revisión por la dirección, exportación del expediente de evidencias.
