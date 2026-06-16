# Plataforma de Reportes — Pradsa

Sitio privado para la gestión, carga y descarga segura de reportes PDF organizados
por carpetas/regiones, con autenticación reforzada (OTP por correo) alineada a
prácticas de ISO 27001.

## Características

- **Autenticación segura (ISO 27001)**
  - Login con correo + contraseña
  - Código de un solo uso (OTP) enviado al correo, expira en 5 min
  - Cambio de contraseña obligatorio en el primer ingreso
  - Sesiones firmadas (JWT HS256) en cookie `httpOnly`
- **Roles y permisos**
  - `SUPER_ADMIN`: administra usuarios, carpetas, ve auditoría y dashboard global
  - `UPLOADER` (~5 personas internas): carga masiva de PDF a cualquier carpeta
  - `CLIENT_FULL`: acceso a las 64 carpetas + dashboard + descargas
  - `CLIENT_FOLDER`: acceso solo a las carpetas asignadas + descargas
- **Carpetas/regiones**
  - Creación individual o **importación masiva por CSV** (`name,description,region_code`)
- **Carga de reportes**
  - Arrastrar y soltar varios PDF, selección de carpeta destino
  - Validación de tipo (solo PDF) y tamaño (máx. 4 MB)
- **Descargas**
  - URLs firmadas de corta duración (60 s) desde almacenamiento privado
- **Dashboard**
  - Totales, descargas del mes, progreso por carpeta y actividad reciente
- **Auditoría**
  - Registro de logins, descargas y cargas con IP y user-agent
  - Filtros por acción/usuario/fecha y exportación a CSV

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (PostgreSQL + Storage) · Resend (email).

## Puesta en marcha

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Configurar variables** — copia `.env.example` a `.env` y completa:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`, `EMAIL_FROM`
   - `SESSION_SECRET` (cadena larga y aleatoria)

3. **Base de datos** — ejecuta `supabase/schema.sql` en el editor SQL de Supabase.

4. **Bucket de almacenamiento** — crea uno privado llamado `reports`:
   ```sql
   insert into storage.buckets (id, name, public) values ('reports','reports', false);
   ```

5. **Crear administrador inicial**
   ```bash
   node --env-file=.env scripts/seed-admin.mjs raulpineda.0197@gmail.com 'TuPasswordTemporal#2026'
   ```

6. **Ejecutar**
   ```bash
   npm run dev      # desarrollo
   npm run build && npm start   # producción
   ```

> En desarrollo, si no configuras `RESEND_API_KEY`, el código OTP se imprime en la
> consola del servidor para facilitar las pruebas.

## Escalabilidad

La arquitectura (Next.js + Supabase) soporta sin problema 100 usuarios concurrentes.
Para producción se recomienda desplegar en Vercel + Supabase y, opcionalmente, mover
las descargas a un CDN con URLs firmadas.
