import type { SessionPayload, OrgRole } from '@/types';

/**
 * Verificación de sesión compatible con el Edge Runtime (middleware).
 * Formato de token idéntico al de lib/auth.ts (HMAC-SHA256 + base64url).
 */
const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
export const SESSION_COOKIE = 'bastion_session';

function b64urlFromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signEdge(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64urlFromBuffer(sig);
}

export async function verifyTokenEdge(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = await signEdge(`${header}.${body}`);
  if (signature !== expected) return null;
  try {
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- Permisos de ruta por rol ----------
// Rutas sólo para roles con edición; el resto de /app es visible por todos.
export const ROLE_ROUTES: Record<string, OrgRole[]> = {
  '/settings': ['OWNER'],
};

export function canAccess(role: OrgRole, path: string): boolean {
  const match = Object.keys(ROLE_ROUTES).find((r) => path.startsWith(r));
  if (!match) return true;
  return ROLE_ROUTES[match].includes(role);
}
