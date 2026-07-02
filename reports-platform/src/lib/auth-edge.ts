import type { Role, SessionPayload } from '@/types';

/**
 * Verificación de sesión compatible con el Edge Runtime (middleware).
 * Usa Web Crypto API en lugar del módulo `crypto` de Node, que el Edge
 * Runtime no soporta. El formato del token (HMAC-SHA256 + base64url) es
 * idéntico al que genera `lib/auth.ts`, así que ambos son interoperables.
 */

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
export const SESSION_COOKIE = 'pradsa_session';

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
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- Permisos por rol (sin dependencias de Node) ----------
export const ROLE_ROUTES: Record<string, Role[]> = {
  '/dashboard': ['SUPER_ADMIN', 'CLIENT_FULL'],
  '/upload': ['SUPER_ADMIN', 'UPLOADER'],
  '/users': ['SUPER_ADMIN'],
  '/audit': ['SUPER_ADMIN'],
  '/folders': ['SUPER_ADMIN', 'UPLOADER', 'CLIENT_FULL', 'CLIENT_BANCA', 'CLIENT_FOLDER'],
};

export function canAccess(role: Role, path: string): boolean {
  const match = Object.keys(ROLE_ROUTES).find((r) => path.startsWith(r));
  if (!match) return true;
  return ROLE_ROUTES[match].includes(role);
}

export function landingFor(role: Role): string {
  if (role === 'UPLOADER') return '/upload';
  if (role === 'CLIENT_FOLDER' || role === 'CLIENT_BANCA') return '/folders';
  return '/dashboard';
}
