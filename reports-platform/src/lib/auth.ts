import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import type { Role, SessionPayload } from '@/types';

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'pradsa_session';
const SESSION_TTL = 60 * 60 * 8; // 8 horas

// ---------- JWT (HS256) mínimo, sin dependencias externas ----------
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sign(data: string): string {
  return base64url(crypto.createHmac('sha256', SECRET).update(data).digest());
}

export function createToken(payload: Omit<SessionPayload, 'exp'>): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const body = base64url(JSON.stringify({ ...payload, exp }));
  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`);
  // Comparación en tiempo constante
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    ) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- Helpers de cookie (server components / route handlers) ----------
export function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

export function getSession(): SessionPayload | null {
  return verifyToken(cookies().get(COOKIE_NAME)?.value);
}

export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  return verifyToken(req.cookies.get(COOKIE_NAME)?.value);
}

export const SESSION_COOKIE = COOKIE_NAME;

// ---------- OTP ----------
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashOtp(code: string): string {
  return crypto.createHmac('sha256', SECRET).update(code).digest('hex');
}

// ---------- Permisos por rol ----------
export const ROLE_ROUTES: Record<string, Role[]> = {
  '/dashboard': ['SUPER_ADMIN', 'CLIENT_FULL'],
  '/upload': ['SUPER_ADMIN', 'UPLOADER'],
  '/users': ['SUPER_ADMIN'],
  '/audit': ['SUPER_ADMIN'],
  '/folders': ['SUPER_ADMIN', 'UPLOADER', 'CLIENT_FULL', 'CLIENT_FOLDER'],
};

export function canAccess(role: Role, path: string): boolean {
  const match = Object.keys(ROLE_ROUTES).find((r) => path.startsWith(r));
  if (!match) return true;
  return ROLE_ROUTES[match].includes(role);
}
